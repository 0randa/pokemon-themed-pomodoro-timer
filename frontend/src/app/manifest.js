export default function manifest() {
  return {
    name: "PomoPet",
    short_name: "PomoPet",
    description: "Gamified focus sessions with timer notifications that work better when the app is backgrounded.",
    start_url: "/",
    display: "standalone",
    background_color: "#fdf6ee",
    theme_color: "#c97c28",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
      {
        src: "/window.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
