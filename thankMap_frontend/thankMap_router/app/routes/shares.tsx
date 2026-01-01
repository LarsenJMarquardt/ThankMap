// app/routes/share.tsx
import type { Route } from "./+types/shares"; // Auto-generated types
import ThankMap from "../components/ThankMap"; 
import type { Gratitude } from "../components/ThankMap";

// 1. THE LOADER: Runs before the page shows
// It grabs the 'code' from the URL and asks your backend for the data
export async function loader({ params }: Route.LoaderArgs) {
  const { code } = params;
  
  try {
    const res = await fetch(`http://localhost:3001/share/${code}`);
    if (!res.ok) throw new Error("Not found");

    const data = await res.json();

    return { targetGratitude: data as Gratitude};
  } catch (error) {
    // If not found, return null
    return { targetGratitude: null };
  }
}

// 2. THE COMPONENT: Renders the map with the data ready
export default function SharedPage({ loaderData }: Route.ComponentProps) {
  
  const { targetGratitude } = loaderData;

  // If the loader failed to find the gratitude, show an error or just the default map
  if (!targetGratitude) {
    return (
      <div className="p-4 bg-red-100 text-red-800 text-center">
        <p>⚠️ That shared gratitude wasn't found. Here is the global map!</p>
        <ThankMap />
      </div>
    );
  }

  // Pass the data down to focus the map
  return <ThankMap initialFocus={targetGratitude} />;
}