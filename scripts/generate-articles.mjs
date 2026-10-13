
import fs from "node:fs/promises";
import path from "node:path";

const SITE_DIR = path.resolve("site");
const POSTS_FILE = path.join(SITE_DIR, "posts.json");
const ARTICLE_DIR = path.join(SITE_DIR, "article");

const SITE_URL = "https://noon.blog";
const DEFAULT_AUTHOR = "Noon.blog";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Escape untrusted text before inserting it into HTML.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Prevent strings from breaking out of a JSON-LD script element.
function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function requiredText(value, field, slug) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing ${field} for article "${slug}"`);
  }

  return value.trim();
}

function formatDate(value, slug) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date for article "${slug}"`);
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid date for article "${slug}"`);
  }

  return value;
}

function renderBody(body) {
  if (!Array.isArray(body)) {
    throw new Error("Article body must be an array");
  }

  return body.map(block => {
    if (typeof block === "string") {
      return `<p>${escapeHtml(block)}</p>`;
    }

    if (!block || typeof block !== "object" ||
        Array.isArray(block)) {
      throw new Error("Invalid article body block");
    }

    if (typeof block.heading === "string") {
      return `<h2>${escapeHtml(block.heading)}</h2>`;
    }

    if (Array.isArray(block.list)) {
      const items = block.list.map(item => {
        if (typeof item !== "string") {
          throw new Error("Article list items must be strings");
        }

        return `<li>${escapeHtml(item)}</li>`;
      }).join("\n");

      return `<ul>\n${items}\n</ul>`;
    }

    throw new Error("Unsupported article body block");
  }).join("\n");
}

function renderArticle(post) {
  const slug = post.slug;
  const title = requiredText(post.title, "title", slug);
  const description = requiredText(post.excerpt, "excerpt", slug);
  const date = formatDate(post.date, slug);
  const category =
    typeof post.category === "string" && post.category.trim()
      ? post.category.trim()
      : "Insights";

  const url = `${SITE_URL}/article/${slug}/`;
  const readingTime =
    typeof post.readingTime === "string" &&
    /^\d+\s+min read$/.test(post.readingTime)
      ? post.readingTime
      : "4 min read";

  const body = renderBody(post.body ?? []);
  const publishedDate = `${date}T00:00:00Z`;

  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    datePublished: publishedDate,
    dateModified: publishedDate,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url
    },
    author: {
      "@type": "Organization",
      name: DEFAULT_AUTHOR,
      url: SITE_URL
    },
    publisher: {
      "@type": "Organization",
      name: DEFAULT_AUTHOR,
      url: SITE_URL
    }
  };

  return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="{{DESCRIPTION}}">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta name="robots" content="index,follow">
    <title>{{TITLE}}</title>
    <link rel="canonical" href="{{CANONICAL_URL}}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="{{TITLE}}">
    <meta property="og:description" content="{{DESCRIPTION}}">
    <meta property="og:url" content="{{CANONICAL_URL}}">
    <link rel="stylesheet" href="../styles.css">
    <link rel="stylesheet" href="./article.css">
    <script type="application/ld+json">{{STRUCTURED_DATA}}</script>
</head>
<body>
    <a class="skip-link" href="#main">Skip to content</a>

    <header class="topbar">
        <a class="brand" href="/">noon.blog<span>•</span></a>
        <button class="menu-toggle" id="menu-toggle"
            aria-expanded="false" aria-controls="main-nav">Menu ☰</button>
        <nav id="main-nav" aria-label="Main navigation">
            <a href="/#featured">Featured</a>
            <a href="/#insights">Latest insights</a>
            <a href="/#research">Research</a>
            <a href="/#about">About</a>
        </nav>
        <a class="header-cta" href="/#subscribe">Get the newsletter ↗</a>
    </header>

    <main id="main" class="article-main">
        <a class="back-link" href="/#insights">← All insights</a>
        <article id="article" class="article-content">
            <p class="eyebrow">{{CATEGORY}}</p>
            <p class="meta">
                <time datetime="{{DATE}}">{{DATE_TEXT}}</time>
                · {{READING_TIME}}
            </p>
            <h1 class="article-title">{{TITLE}}</h1>
            <p class="article-deck">{{DESCRIPTION}}</p>
            <div class="article-body">
                {{ARTICLE_BODY}}
            </div>
        </article>

        <aside class="ad-slot" aria-label="Advertisement">
            <span>ADVERTISEMENT</span>
            <p>Advertisement placement</p>
        </aside>
    </main>

    <footer class="footer">
        <a class="brand" href="/">noon.blog<span>•</span></a>
        <div class="footer-links">
            <a href="/#about">About</a>
            <a href="/#subscribe">Newsletter</a>
            <a href="mailto:hello@example.com">Contact</a>
        </div>
        <p>© <span id="year"></span> noon.blog.</p>
    </footer>

    <script>
        document.querySelector("#year").textContent =
            new Date().getFullYear();

        const toggle = document.querySelector("#menu-toggle");
        const nav = document.querySelector("#main-nav");

        toggle.addEventListener("click", () => {
            const open = nav.classList.toggle("open");
            toggle.setAttribute("aria-expanded", String(open));
        });
    </script>
</body>
</html>`;
}

async function main() {
  const raw = await fs.readFile(POSTS_FILE, "utf8");
  const data = JSON.parse(raw);

  if (!data || !Array.isArray(data.posts)) {
    throw new Error("posts.json must contain a posts array");
  }

  const seen = new Set();

  // Validate all slugs before writing any pages.
  for (const post of data.posts) {
    if (!post || typeof post.slug !== "string" ||
        !SLUG_PATTERN.test(post.slug)) {
      throw new Error(`Invalid article slug: ${post?.slug}`);
    }

    if (seen.has(post.slug)) {
      throw new Error(`Duplicate article slug: ${post.slug}`);
    }

    seen.add(post.slug);
  }

  await fs.mkdir(ARTICLE_DIR, { recursive: true });

  for (const post of data.posts) {
    // Validate and render before writing this article.
    const html = renderArticle(post);
    const outputDir = path.join(ARTICLE_DIR, post.slug);
    const outputFile = path.join(outputDir, "index.html");

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputFile, html, {
      encoding: "utf8",
      flag: "w"
    });

    console.log(`Generated /article/${post.slug}/`);
  }

  console.log(`Successfully generated ${data.posts.length} articles.`);
}

main().catch(error => {
  console.error("Article generation failed:", error.message);
  process.exitCode = 1;
});