import LocalProApp from "../components/LocalProApp";
import { getCategories, getSpecialists } from "../lib/specialists";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [specialists, categories] = await Promise.all([getSpecialists(), getCategories()]);

  return <LocalProApp initialSpecialists={specialists} categories={categories} />;
}
