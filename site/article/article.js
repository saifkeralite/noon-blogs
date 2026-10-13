(() => {
  "use strict";
  const root = document.querySelector("#article");
  const url = new URL(window.location.href);
const slug = url.pathname.split("/").filter(Boolean).pop();
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const dateText = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? "Date to be announced" : new Intl.DateTimeFormat("en", {month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d); };
  async function init() {
    try {
      const response = await fetch("../posts.json", {cache:"no-cache",credentials:"omit"});
      if (!response.ok) throw new Error();
      const data = await response.json();
      const post = Array.isArray(data.posts) ? data.posts.find(p => p && p.slug === slug) : null;
      if (!post) { root.append(el("h1","article-title","Article not found"),el("p","","This article may have moved or the link may be incorrect.")); return; }
      document.title = `${post.title} — Fieldnotes`;
      document.querySelector('meta[name="description"]').content = post.excerpt.slice(0,155);
      root.append(el("p","eyebrow",post.category || "Insights"),el("p","meta",`${dateText(post.date)} · ${post.readingTime || "4 min read"}`),el("h1","article-title",post.title),el("p","article-deck",post.excerpt));
      const body = el("div","article-body");
      (Array.isArray(post.body) ? post.body : []).forEach(block => {
        if (typeof block === "string") body.append(el("p","",block));
        else if (block && block.heading) body.append(el("h2","",block.heading));
        else if (block && Array.isArray(block.list)) {
          const ul = document.createElement("ul");
          block.list.forEach(item => { if (typeof item === "string") ul.append(el("li","",item)); });
          body.append(ul);
        }
      });
      root.append(body);
    } catch { root.append(el("h1","article-title","Content unavailable"),el("p","","Please try again later.")); }
  }
  init();
})();