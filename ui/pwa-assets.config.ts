import { defineConfig } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  /* remember to include the preset for favicons and apple touch icon */
  headLinkOptions: {
    preset: "2023",
  },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [
        [48, "favicon-48x48.ico"],
        [64, "favicon.ico"],
      ],
    },
    maskable: {
      sizes: [512],
    },
    apple: {
      sizes: [180],
    },
  },
  images: ["public/logo.svg"],
});
