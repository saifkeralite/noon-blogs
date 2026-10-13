(() => {
  "use strict";
  const featuredGrid = document.querySelector("#featured-grid");
  const insightsGrid = document.querySelector("#insights-grid");
  const researchGrid = document.querySelector("#research-grid");
  const filtersEl = document.querySelector("#filters");
  const searchInput = document.querySelector("#search");
  const emptyState = document.querySelector("#empty-state");
  const menuToggle = document.querySelector("#menu-toggle");
  const nav = document.querySelector("#main-nav");
  let posts = [];
  let activeCategory = "All";

  document.querySelector("#year").textContent = String(new Date().getFullYear());
  menuToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });
  nav.addEventListener("click", event => {
    if (event.target.closest("a")) {
      nav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });

  // Content is untrusted input: build DOM nodes and use textContent, never innerHTML.
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const dateText = value => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "Date to be announced" :
      new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
  };
  const slugValid = slug => typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  function articleUrl(post) { return `./article.html?post=${encodeURIComponent(post.slug)}`; }
  function linkFor(post) {
    const a = el("a", "read-link", "Read article");
    const arrow = el("span", "", "↗");
    a.append(arrow);
    a.href = articleUrl(post);
    return a;
  }
  function makeArt(post) {
    const art = el("div", "card-art");
    art.style.setProperty("--art-bg", post.artBackground || "#ece8fb");
    art.style.setProperty("--art-ink", post.artInk || "#40317d");
    art.append(el("span", "art-label", post.artLabel || "FIELDNOTES"));
    art.setAttribute("aria-hidden", "true");
    return art;
  }
  function featuredCard(post) {
    const card = el("article", "featured-card");
    card.append(makeArt(post));
    const body = el("div", "featured-card-body");
    body.append(el("span", "category", post.category || "Insights"));
    body.append(el("p", "meta", `${dateText(post.date)} · ${post.readingTime || "4 min read"}`));
    body.append(el("h3", "", post.title));
    body.append(el("p", "", post.excerpt));
    body.append(linkFor(post));
    card.append(body);
    return card;
  }
  function insightCard(post) {
    const card = el("article", "insight-card");
    card.append(el("span", "category", post.category || "Insights"));
    card.append(el("p", "meta", `${dateText(post.date)} · ${post.readingTime || "4 min read"}`));
    card.append(el("h3", "", post.title));
    card.append(el("p", "", post.excerpt));
    card.append(linkFor(post));
    return card;
  }
  function researchCard(post) {
    const card = el("article", "research-card");
    card.append(el("span", "category", post.category || "Resource"));
    card.append(el("h3", "", post.title));
    card.append(el("p", "", post.excerpt));
    card.append(linkFor(post));
    return card;
  }
  function renderFilters() {
    const categories = ["All", ...new Set(posts.map(p => p.category).filter(Boolean))];
    filtersEl.replaceChildren();
    categories.forEach(category => {
      const button = el("button", "filter-btn", category);
      button.type = "button";
      button.setAttribute("aria-pressed", String(activeCategory === category));
      button.addEventListener("click", () => {
        activeCategory = category;
        renderFilters();
        renderInsights();
      });
      filtersEl.append(button);
    });
  }
  function renderInsights() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const visible = posts.filter(post => {
      const categoryMatches = activeCategory === "All" || post.category === activeCategory;
      const haystack = [post.title, post.excerpt, post.category, ...(post.tags || [])].filter(Boolean).join(" ").toLocaleLowerCase();
      return categoryMatches && haystack.includes(query) && !post.research;
    });
    insightsGrid.replaceChildren(...visible.map(insightCard));
    emptyState.hidden = visible.length > 0;
  }
  async function init() {
    try {
      const response = await fetch("./posts.json", { cache: "no-cache", credentials: "omit" });
      if (!response.ok) throw new Error("Post data unavailable");
      const data = await response.json();
      if (!Array.isArray(data.posts)) throw new Error("Invalid post data");
      posts = data.posts.filter(p => p && slugValid(p.slug) && typeof p.title === "string" &&
        typeof p.excerpt === "string" && typeof p.date === "string");
      featuredGrid.replaceChildren(...posts.filter(p => p.featured).slice(0, 4).map(featuredCard));
      if (!featuredGrid.children.length) featuredGrid.append(el("p", "", "Mark up to four posts as featured in posts.json."));
      renderFilters();
      renderInsights();
      researchGrid.replaceChildren(...posts.filter(p => p.research).slice(0, 3).map(researchCard));
      if (!researchGrid.children.length) {
        researchGrid.append(el("p", "", "Mark a post with \"research\": true to feature it here."));
      }
    } catch {
      featuredGrid.replaceChildren(el("p", "", "Articles could not be loaded. Please try again later."));
      insightsGrid.replaceChildren();
      emptyState.hidden = false;
      emptyState.textContent = "Blog content is temporarily unavailable.";
    }
  }
  searchInput.addEventListener("input", renderInsights);
  init();
})();