import { richTextToPlainText } from "./richText.js";

// Only real merchant destinations become links. Missing/unsafe URLs stay text.
export function bannerDestination(value) {
  const target = String(value || "")
    .trim()
    .replace(/^#(?=\/)/, "");
  if (!target || /[\\\r\n]/.test(target) || target.startsWith("//"))
    return null;
  if (target.startsWith("/")) return { href: target, internal: true };
  try {
    const url = new URL(target);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? { href: url.href, internal: false }
      : null;
  } catch {
    return null;
  }
}

export function managedHeroSlides(
  banners = [],
  announcements = [],
  now = Date.now(),
) {
  const bannerSlides = (Array.isArray(banners) ? banners : [])
    .filter(
      (banner) =>
        banner &&
        banner.is_active !== false &&
        (banner.title || banner.image_url),
    )
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
    .map((banner) => ({
      id: `banner-${banner.id}`,
      title: banner.title || "10th West Motorcycle Parts & Accessories",
      text: banner.subtitle || "",
      image: banner.image_url || "",
      destination: bannerDestination(banner.link_url),
      cta: banner.button_text || "View details",
      kind: "Store promotion",
    }));
  const announcementSlides = (Array.isArray(announcements) ? announcements : [])
    .filter(
      (item) =>
        item?.is_published !== false &&
        item?.title &&
        (!item.published_at || new Date(item.published_at).getTime() <= now),
    )
    .sort(
      (a, b) =>
        new Date(b.published_at || b.created_at || 0) -
        new Date(a.published_at || a.created_at || 0),
    )
    .map((item) => ({
      id: `announcement-${item.id}`,
      title: item.title,
      text: richTextToPlainText(item.content || ""),
      image: "",
      destination: null,
      kind: "Store announcement",
    }));
  // Announcements have no image, CTA, priority or expiry fields in today's API.
  // Banners have no schedule fields. Do not infer relationships from coupon codes.
  return [...bannerSlides, ...announcementSlides];
}
