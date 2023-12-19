//go:generate yarn build
package ui

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/f-eld-ch/sitrep/internal/buildinfo"
)

const (
	ifModifiedSinceHeaderName = "If-Modified-Since"
	lastModifiedHeaderName    = "Last-Modified"
)

//go:embed all:build
var spaFiles embed.FS

func SPAHandler() http.HandlerFunc {
	spaFS, err := fs.Sub(spaFiles, "build")
	buildInfo := buildinfo.GetVersion()

	if err != nil {
		panic(fmt.Errorf("failed getting the sub tree for the site files: %w", err))
	}
	return func(w http.ResponseWriter, r *http.Request) {
		fp := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		f, err := spaFS.Open(fp)
		if err == nil {
			defer f.Close()
		}

		// check whether a file exists or is a directory at the given path
		// if file does not exist or is path, serve index.html instead
		if os.IsNotExist(err) {
			r.URL.Path = "/index.html"
		}
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")

		// set aggressive cache control headers for everything in static
		if filepath.HasPrefix(fp, "static") {
			// set cache control header to serve file for a year
			// static files in this case need to be cache busted
			// (usualy by appending a hash to the filename)
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}

		// compensate for the missing ModTime in embedFS
		LastModified(buildInfo.BuildTime, http.FileServer(http.FS(spaFS))).ServeHTTP(w, r)
	}
}

// LastModified replies to the HTTP request in such a way that it deals with
// conditional GETs by sending out a "Last-Modified" HTTP response header,
// and properly dealing with a "If-Modified-Since" HTTP request header.
//
// Note that this request an http.Handler. You will still need to call
// the returned handler's ServerHTTP method.
func LastModified(modtime time.Time, subhandler http.Handler) http.Handler {

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		// Generate value for Last-Modified HTTP response header.
		lastModifiedHeaderValue := modtime.UTC().Format(time.RFC1123)

		// If the HTTP request has a If-Modified-Since request header
		// and it matches the value of the "Last-Modified" HTTP response
		// header we would have sent, then try to deal with it.
		//
		// (If we do indeed deal with this, then this func will return
		// at this point, and will not continue with the rest of
		// the code.)
		ifModifiedSinceHeaderValue := r.Header.Get(ifModifiedSinceHeaderName)
		if "GET" == strings.ToUpper(r.Method) && "" != ifModifiedSinceHeaderValue && lastModifiedHeaderValue == ifModifiedSinceHeaderValue {

			headers := w.Header()
			headers.Del("Content-Length")
			headers.Del("Content-Type")

			w.WriteHeader(http.StatusNotModified)

			return
		}

		// Set the value for the Last-Modified HTTP response header.
		w.Header().Add(lastModifiedHeaderName, lastModifiedHeaderValue)

		// Pass to sub-handler.
		subhandler.ServeHTTP(w, r)
	})
}
