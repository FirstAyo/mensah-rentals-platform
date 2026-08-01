export function adminHomepageMediaUrl(media: { id: string; url: string }) {
  const filename = media.url.split('/').at(-1);
  if (!filename || !/^[a-f0-9]{64}\.webp$/.test(filename)) return '';
  return `/api/homepage/media/${media.id}/${filename}`;
}
