const SITE_ROOT = new URL('../../', import.meta.url);

/** Resolve a repository-relative page path for local serving and GitHub Pages. */
export function siteHref(path) {
    return new URL(String(path).replace(/^\/+/, ''), SITE_ROOT).href;
}
