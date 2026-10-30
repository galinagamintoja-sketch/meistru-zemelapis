// For nonpersonal reference labels only. Never cache profiles, permissions,
// contacts, session state or moderation decisions with this helper.
export function createPublicReferenceCache<T>(load: () => Promise<T>, ttlMs: number, now = Date.now) {
  let generation = 0;
  let value: { data: T; expires: number } | undefined;
  let pending: Promise<T> | undefined;
  const read = async (): Promise<T> => {
    if (value && value.expires > now()) return structuredClone(value.data);
    if (!pending) {
      const startedGeneration = generation;
      const work = Promise.resolve().then(load).then((data) => {
        if (startedGeneration === generation) value = { data: structuredClone(data), expires: now() + ttlMs };
        return data;
      });
      pending = work;
      void work.finally(() => { if (pending === work) pending = undefined; }).catch(() => {});
    }
    return structuredClone(await pending);
  };
  return Object.assign(read, { clear: () => { generation++; value = undefined; pending = undefined; } });
}
