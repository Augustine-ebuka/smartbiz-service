import { User } from '../models/user.model';

// Normalizes free text into a URL-safe slug: lowercase, alphanumeric words
// joined by single hyphens, no leading/trailing hyphens.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Slugifies `base` and, if the result is already taken by another user,
// appends -2, -3, ... until a free one is found. `excludeUserId` lets a user
// re-save their own existing slug without colliding with themselves.
export async function generateUniqueStoreSlug(base: string, excludeUserId?: string): Promise<string> {
  const root = slugify(base) || 'store';
  let candidate = root;
  let suffix = 2;

  while (
    await User.exists({
      'settings.companyProfile.storeSlug': candidate,
      ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
    })
  ) {
    candidate = `${root}-${suffix}`;
    suffix++;
  }

  return candidate;
}
