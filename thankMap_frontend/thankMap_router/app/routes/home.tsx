// app/routes/home.tsx
import type { Route } from "./+types/home";
import ThankMap from "../components/ThankMap"; // Import from the parent app folder

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ThankMap - Global Gratitude" },
    { name: "description", content: "See what the world is grateful for." },
  ];
}

export default function Home() {
  return <ThankMap />;
}