
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

const SITE_DIR = path.join(ROOT_DIR, "site");
const POSTS_FILE = path.join(SITE_DIR, "posts.json");
const TEMPLATE_FILE = path.join(
  SCRIPT_DIR,
  "templates",
  "article.html"
);
const ARTICLE_DIR = path.join(SITE_DIR, "article");

const SITE_URL = "https://noon.blog";
const SITE_NAME = "noon.blog";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ALLOWED_CODE_LANGUAGES = new Set([
  "text",
  "tsx",
  "ts",
  "jsx",
  "js",
  "json",
  "bash",
  "html",
  "css",
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
  if (
    typeof slug !== "string" ||
    !SLUG_PATTERN.test(slug)
  ) {
    throw new Error(
      `Invalid article slug "${String(slug)}". ` +
      "Use lowercase letters, numbers, and single hyphens."
    );
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
// Article body renderer
// Supported formats:
// - "Paragraph text"
// - { heading: "Section heading" }
// - { list: ["Item one", "Item two"] }
// - { language: "tsx", code: "..." }
// --------------------------------------------------

function renderBody(body, slug) {
  if (!Array.isArray(body)) {
    throw new Error(
      `Article "${slug}": body must be an array.`
    );
  }

  if (body.length === 0) {
    throw new Error(
      `Article "${slug}": body cannot be empty.`
    );
  }

  return body
    .map((block, index) => {
      // Paragraph
      if (typeof block === "string") {
        if (!block.trim()) {
          throw new Error(
            `Article "${slug}": empty paragraph at index ${index}.`
          );
        }

        return `<p>${escapeHtml(block)}</p>`;
      }

      if (
        !block ||
        typeof block !== "object" ||
        Array.isArray(block)
      ) {
        throw new Error(
          `Article "${slug}": invalid body block at index ${index}.`
        );
      }

      // Heading
      if (typeof block.heading === "string") {
        if (!block.heading.trim()) {
          throw new Error(
            `Article "${slug}": empty heading at index ${index}.`
          );
        }

        return `<h2>${escapeHtml(block.heading)}</h2>`;
      }

      // Unordered list
      if (Array.isArray(block.list)) {
        if (block.list.length === 0) {
          throw new Error(
            `Article "${slug}": empty list at index ${index}.`
          );
        }

        const items = block.list.map((item) => {
          if (
            typeof item !== "string" ||
            !item.trim()
          ) {
            throw new Error(
              `Article "${slug}": list items must be non-empty strings.`
            );
          }

          return `<li>${escapeHtml(item)}</li>`;
        });

        return `<ul>\n${items.join("\n")}\n</ul>`;
      }

      // Code block
      if (typeof block.code === "string") {
        const language =
          typeof block.language === "string"
            ? block.language.toLowerCase()
            : "text";

        if (!ALLOWED_CODE_LANGUAGES.has(language)) {
          throw new Error(
            `Article "${slug}": unsupported code language ` +
            `"${language}" at index ${index}.`
          );
        }

        return [
          '<pre class="code-block">',
          `<code class="language-${language}">${escapeHtml(block.code)}</code>`,
          "</pre>",
        ].join("\n");
      }

      throw new Error(
        `Article "${slug}": unsupported article body block ` +
        `at index ${index}.`
      );
    })
    .join("\n\n");
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
// Render one complete article page
// --------------------------------------------------

function renderArticle(post, template) {
  const slug = validateSlug(post.slug);

  const title = requiredText(post.title, "title", slug);
  const description = requiredText(
    post.excerpt,
    "excerpt",
    slug
  );
  const category = requiredText(
    post.category,
    "category",
    slug
  );
  const date = validateDate(post.date, slug);

  const readingTime =
    typeof post.readingTime === "string" &&
    post.readingTime.trim()
      ? post.readingTime.trim()
      : "5 min read";

  const canonicalUrl =
    `${SITE_URL}/article/${slug}/`;

  const articleBody = renderBody(post.body, slug);

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

  // Replace placeholders in one pass so inserted article
  // content is never processed as another template value.
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

  // Fail rather than publish an incomplete template.
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
// Generate every article page
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
    throw new Error(
      `Could not parse posts.json: ${error.message}`
    );
  }

  if (!data || !Array.isArray(data.posts)) {
    throw new Error(
      'posts.json must contain a "posts" array.'
    );
  }

  if (data.posts.length === 0) {
    throw new Error("No articles found in posts.json.");
  }

  const seenSlugs = new Set();

  // Validate all slugs before writing any pages.
  for (const post of data.posts) {
    if (!post || typeof post !== "object") {
      throw new Error("Every post must be an object.");
    }

    const slug = validateSlug(post.slug);

    if (seenSlugs.has(slug)) {
      throw new Error(`Duplicate article slug "${slug}".`);
    }

    seenSlugs.add(slug);
  }

  await fs.mkdir(ARTICLE_DIR, { recursive: true });

  let generatedCount = 0;

  for (const post of data.posts) {
    const slug = post.slug;
    const html = renderArticle(post, template);

    const outputDirectory = path.join(ARTICLE_DIR, slug);
    const outputFile = path.join(
      outputDirectory,
      "index.html"
    );

    await fs.mkdir(outputDirectory, { recursive: true });

    await fs.writeFile(outputFile, html, {
      encoding: "utf8",
      flag: "w",
    });

    console.log(`Generated: site/article/${slug}/index.html`);

    generatedCount += 1;
  }

  console.log(
    `Article generation complete. Generated ${generatedCount} page(s).`
  );
}

main().catch((error) => {
  console.error("Article generation failed:", error.message);
  process.exitCode = 1;
});