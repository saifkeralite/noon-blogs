
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const postsPath = path.join(rootDir, "site", "posts.json");
const articlesDir = path.join(rootDir, "content", "articles");

const postsData = JSON.parse(fs.readFileSync(postsPath, "utf8"));

fs.mkdirSync(articlesDir, { recursive: true });

function toMarkdown(body) {
  return body.map((item) => {
    if (typeof item === "string") {
      return item;
    }

    if (item.heading) {
      return `## ${item.heading}`;
    }

    if (item.code !== undefined) {
      const language = item.language || "";
      return `\`\`\`${language}\n${item.code}\n\`\`\``;
    }

    if (Array.isArray(item.list)) {
      return item.list.map((entry) => `- ${entry}`).join("\n");
    }

    throw new Error(
      `Unsupported article body item: ${JSON.stringify(item)}`
    );
  }).join("\n\n") + "\n";
}

for (const post of postsData.posts) {
  if (!post.slug || !Array.isArray(post.body)) {
    throw new Error(
      `Post "${post.slug ?? "unknown"}" has no valid body array`
    );
  }

  // Prevent slugs from creating files outside the articles directory.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) {
    throw new Error(`Invalid article slug: ${post.slug}`);
  }

  const markdownPath = path.join(
    articlesDir,
    `${post.slug}.md`
  );

  if (fs.existsSync(markdownPath)) {
    throw new Error(
      `File already exists: ${markdownPath}. Back it up or rename it before migrating.`
    );
  }

  fs.writeFileSync(
    markdownPath,
    toMarkdown(post.body),
    "utf8"
  );

  console.log(`Created ${path.relative(rootDir, markdownPath)}`);
}

// Keep all metadata, but remove embedded article bodies.
const metadata = {
  ...postsData,
  posts: postsData.posts.map(({ body, ...post }) => post),
};

fs.writeFileSync(
  postsPath,
  `${JSON.stringify(metadata, null, 2)}\n`,
  "utf8"
);

console.log("Migration completed. Article bodies are now Markdown files.");
