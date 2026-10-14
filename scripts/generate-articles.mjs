
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

const SITE_DIR = path.join(ROOT_DIR, "site");
const POSTS_FILE = path.join(SITE_DIR, "posts.json");
const CONTENT_DIR = path.join(ROOT_DIR, "content", "articles");
const TEMPLATE_FILE = path.join(
  ROOT_DIR,
  "article",
  "template",
  "article.html"
);
const ARTICLE_DIR = path.join(SITE_DIR, "article");

const SITE_URL = "https://noon.blog";
const SITE_NAME = "noon.blog";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ALLOWED_CODE_LANGUAGES = new Set([
  "text", "tsx", "ts", "jsx", "js", "json",
  "bash", "html", "css",
]);

// --------------------------------------------------
// Security helpers
// --------------------------------------------------

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

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
    throw new Error(
      `Article "${slug}": "${field}" must be a non-empty string.`
    );
  }

  return value.trim();
}

function validateSlug(slug) {
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid article slug "${String(slug)}".`);
  }

  return slug;
}

function validateDate(value, slug) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error(
      `Article "${slug}": date must use YYYY-MM-DD format.`
    );
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(
      `Article "${slug}": "${value}" is not a valid date.`
    );
  }

  return value;
}

// --------------------------------------------------
// Markdown rendering
// --------------------------------------------------

marked.setOptions({
  gfm: true,
  breaks: false,
});

function renderMarkdown(markdown, slug) {
  if (!markdown.trim()) {
    throw new Error(`Article "${slug}": Markdown content is empty.`);
  }

  const rawHtml = marked.parse(markdown, {
    async: false,
  });

  return sanitizeHtml(rawHtml, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "h1",
      "img",
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      code: ["class"],
      img: ["src", "alt", "title", "width", "height"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform(
        "a",
        { rel: "noopener noreferrer" },
        true
      ),
    },
  });
}

function validateCodeLanguages(markdown, slug) {
  const fencePattern = /^ {0,3}(`{3,}|~{3,})([^`~\r\n]*)$/gm;
  let match;

  while ((match = fencePattern.exec(markdown)) !== null) {
    const info = match[2].trim();

    if (!info) continue;

    const language = info.split(/\s+/)[0].toLowerCase();

    if (!ALLOWED_CODE_LANGUAGES.has(language)) {
      throw new Error(
        `Article "${slug}": unsupported code language "${language}".`
      );
    }
  }
}

// --------------------------------------------------
// Date formatting
// --------------------------------------------------

function formatDate(date) {
  return new Date(`${date}T00:00:00.000Z`)
    .toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
}

// --------------------------------------------------
// Render one article
// --------------------------------------------------

async function renderArticle(post, template) {
  const slug = validateSlug(post.slug);

  const title = requiredText(post.title, "title", slug);
  const description = requiredText(post.excerpt, "excerpt", slug);
  const category = requiredText(post.category, "category", slug);
  const date = validateDate(post.date, slug);

  const readingTime =
    typeof post.readingTime === "string" && post.readingTime.trim()
      ? post.readingTime.trim()
      : "5 min read";

  const markdownPath = path.join(CONTENT_DIR, `${slug}.md`);
  let markdown;

  try {
    markdown = await fs.readFile(markdownPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Article "${slug}" is missing its Markdown file: ` +
        `content/articles/${slug}.md`
      );
    }

    throw error;
  }

  validateCodeLanguages(markdown, slug);

  const articleBody = renderMarkdown(markdown, slug);
  const canonicalUrl = `${SITE_URL}/article/${slug}/`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    datePublished: `${date}T00:00:00.000Z`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
    },
  };

  const replacements = {
    TITLE: escapeHtml(title),
    DESCRIPTION: escapeHtml(description),
    CANONICAL_URL: escapeHtml(canonicalUrl),
    CATEGORY: escapeHtml(category),
    DATE: escapeHtml(date),
    DATE_TEXT: escapeHtml(formatDate(date)),
    READING_TIME: escapeHtml(readingTime),
    STRUCTURED_DATA: safeJson(structuredData),
    ARTICLE_BODY: articleBody,
  };

  const html = template.replace(
    /\{\{([A-Z_]+)\}\}/g,
    (match, key) => {
      if (!Object.hasOwn(replacements, key)) {
        throw new Error(
          `Unknown template placeholder "${match}" in "${slug}".`
        );
      }

      return replacements[key];
    }
  );

  const unresolved = html.match(/\{\{[A-Z_]+\}\}/);

  if (unresolved) {
    throw new Error(
      `Unresolved template placeholder "${unresolved[0]}" ` +
      `in article "${slug}".`
    );
  }

  return html;
}

// --------------------------------------------------
// Generate article pages
// --------------------------------------------------

async function main() {
  console.log("Starting article generation...");

  const [postsFileContent, template] = await Promise.all([
    fs.readFile(POSTS_FILE, "utf8"),
    fs.readFile(TEMPLATE_FILE, "utf8"),
  ]);

  let data;

  try {
    data = JSON.parse(postsFileContent);
  } catch (error) {
    throw new Error(`Could not parse posts.json: ${error.message}`);
  }

  if (!data || !Array.isArray(data.posts) || data.posts.length === 0) {
    throw new Error('posts.json must contain a non-empty "posts" array.');
  }

  const seenSlugs = new Set();

  for (const post of data.posts) {
    if (!post || typeof post !== "object" || Array.isArray(post)) {
      throw new Error("Every post must be an object.");
    }

    const slug = validateSlug(post.slug);

    if (seenSlugs.has(slug)) {
      throw new Error(`Duplicate article slug "${slug}".`);
    }

    seenSlugs.add(slug);
  }

  // Render all pages before writing any of them.
  const generatedPages = [];

  for (const post of data.posts) {
    const html = await renderArticle(post, template);
    generatedPages.push({ slug: post.slug, html });
  }

  for (const { slug, html } of generatedPages) {
    const outputDirectory = path.join(ARTICLE_DIR, slug);
    const outputFile = path.join(outputDirectory, "index.html");

    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(outputFile, html, "utf8");

    console.log(`Generated: site/article/${slug}/index.html`);
  }

  console.log(
    `Article generation complete. Generated ${generatedPages.length} page(s).`
  );
}

main().catch((error) => {
  console.error("Article generation failed:", error.message);
  process.exitCode = 1;
});
