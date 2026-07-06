import LocalProApp from "../components/LocalProApp";
import { getCategories, getSpecialists } from "../lib/specialists";

export default async function Home() {
  const [specialists, categories] = await Promise.all([getSpecialists(), getCategories()]);

  return <LocalProApp initialSpecialists={specialists} categories={categories} />;
}
