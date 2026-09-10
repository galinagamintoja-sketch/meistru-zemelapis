export function queuedPhotoStatus(count: number) {
  if (count === 0) return "Nuotraukų eilė tuščia.";
  if (count === 1) return "1 nuotrauka optimizuota ir paruošta peržiūrai.";
  return `${count} nuotraukos optimizuotos ir paruoštos peržiūrai.`;
}
