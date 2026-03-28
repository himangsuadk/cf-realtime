/** Create a new room. Returns the UUID room ID. */
export async function createRoom(): Promise<string> {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? 'Failed to create room');
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}
