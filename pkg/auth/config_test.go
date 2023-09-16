package auth

import (
	"os"
	"testing"

	goblin "github.com/franela/goblin"
	. "github.com/onsi/gomega"
)

func TestConfig(t *testing.T) {
	g := goblin.Goblin(t)

	//special hook for gomega
	RegisterFailHandler(func(m string, _ ...int) { g.Fail(m) })

	g.Describe("TestConfig", func() {

		g.Describe("DefaultConfig", func() {
			os.Setenv("OIDC_CLIENT_ID", "client-id")
			os.Setenv("OIDC_CLIENT_SECRET", "client-secret")
			os.Setenv("OIDC_ISSUER_URL", "issuer-url")
			os.Setenv("OIDC_REDIRECT_URL", "redirect-url")
			c := DefaultConfig()

			g.It("should retrieve values from env", func() {
				Expect(c.ClientID).To(BeEquivalentTo("client-id"))
				Expect(c.ClientSecret).To(BeEquivalentTo("client-secret"))
				Expect(c.IssuerURL).To(BeEquivalentTo("issuer-url"))
				Expect(c.RedirectURL).To(BeEquivalentTo("redirect-url"))
			})
		})

		g.Describe("ExampleConfigDex", func() {
			c := ExampleConfigDex()

			g.It("should match dex example-app config", func() {
				Expect(c.ClientID).To(BeEquivalentTo("example-app"))
				Expect(c.ClientSecret).To(BeEquivalentTo("ZXhhbXBsZS1hcHAtc2VjcmV0"))
				Expect(c.IssuerURL).To(BeEquivalentTo("http://127.0.0.1:5556/dex"))
				Expect(c.RedirectURL).To(BeEquivalentTo("http://127.0.0.1:5555/callback"))
			})
		})

		g.Describe("ExampleConfigGoogle", func() {
			os.Setenv("GOOGLE_OAUTH2_CLIENT_ID", "client-id")
			os.Setenv("GOOGLE_OAUTH2_CLIENT_SECRET", "client-secret")
			c := ExampleConfigGoogle()

			g.It("should match example google config", func() {
				Expect(c.ClientID).To(BeEquivalentTo("client-id"))
				Expect(c.ClientSecret).To(BeEquivalentTo("client-secret"))
				Expect(c.IssuerURL).To(BeEquivalentTo("https://accounts.google.com"))
				Expect(c.RedirectURL).To(BeEquivalentTo("http://127.0.0.1:5556/auth/google/callback"))
			})
		})

		g.Describe("Validate", func() {
			c := ExampleConfigDex()
			c.ClientID = ""
			g.It("should error on empty ClientID", func() {
				Expect(c.Validate()).ToNot(BeNil())
			})

			c = ExampleConfigDex()
			c.ClientSecret = ""
			g.It("should error on empty ClientSecret", func() {
				Expect(c.Validate()).ToNot(BeNil())
			})

			c = ExampleConfigDex()
			c.IssuerURL = ""
			g.It("should error on empty IssuerURL", func() {
				Expect(c.Validate()).ToNot(BeNil())
			})

			c = ExampleConfigDex()
			c.RedirectURL = ""
			g.It("should error on empty RedirectURL", func() {
				Expect(c.Validate()).ToNot(BeNil())
			})
		})

		// g.Describe("GetOidcAuth", func() {
		// 	auth, err := GetOidcAuth(ExampleConfigDex())

		// 	g.It("should work", func() {
		// 		Expect(auth).NotTo(BeNil())
		// 		Expect(err).To(BeNil())
		// 	})
		// })

		// g.Describe("c.GetOidcAuth", func() {
		// 	c := ExampleConfigDex()
		// 	auth, err := c.GetOidcAuth()

		// 	g.It("should work", func() {
		// 		Expect(auth).NotTo(BeNil())
		// 		Expect(err).To(BeNil())
		// 	})
		// })

	})
}
