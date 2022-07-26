import { Remarkable } from "remarkable";
var md = new Remarkable("commonmark");

md.set({
  html: false,
  breaks: false,
});

export default md;
