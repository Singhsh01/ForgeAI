import { Octokit } from "octokit";
import { config } from "./config";
import { registerSecret } from "./redact";

/**
 * GitHub access. The token lives only in server memory; it is never sent to the browser,
 * never placed in model context, and never written to disk.
 */
export class GitHubNotConfigured extends Error {
  constructor() {
    super("FORGEAI_GITHUB_TOKEN is not configured. Add a fine-grained token to .env to use GitHub repositories.");
  }
}

let client: Octokit | undefined;
export function github(): Octokit {
  const token = config().githubToken;
  if (!token) throw new GitHubNotConfigured();
  registerSecret(token);
  client ??= new Octokit({ auth: token, userAgent: "ForgeAI/0.1" });
  return client;
}

export function githubToken() {
  const t = config().githubToken;
  registerSecret(t);
  return t;
}

export async function viewer() {
  const { data } = await github().rest.users.getAuthenticated();
  return { login: data.login, avatar: data.avatar_url, name: data.name };
}

export async function listAccessibleRepos() {
  const { data } = await github().rest.repos.listForAuthenticatedUser({ per_page: 100, sort: "pushed" });
  return data.map((r) => ({
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    description: r.description,
    language: r.language,
    pushedAt: r.pushed_at,
    canPush: Boolean(r.permissions?.push),
  }));
}

export async function getRepoInfo(fullName: string) {
  const [owner, repo] = splitName(fullName);
  const { data } = await github().rest.repos.get({ owner, repo });
  return {
    fullName: data.full_name,
    private: data.private,
    defaultBranch: data.default_branch,
    cloneUrl: data.clone_url,
    description: data.description,
    language: data.language,
    canPush: Boolean(data.permissions?.push),
  };
}

export async function listIssues(fullName: string) {
  const [owner, repo] = splitName(fullName);
  const { data } = await github().rest.issues.listForRepo({ owner, repo, state: "open", per_page: 50 });
  return data
    .filter((i) => !i.pull_request)
    .map((i) => ({ number: i.number, title: i.title, body: i.body ?? "", url: i.html_url, labels: i.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")), author: i.user?.login }));
}

export async function getIssue(fullName: string, number: number) {
  const [owner, repo] = splitName(fullName);
  const { data } = await github().rest.issues.get({ owner, repo, issue_number: number });
  return { number: data.number, title: data.title, body: data.body ?? "", url: data.html_url };
}

export async function listRemoteBranches(fullName: string) {
  const [owner, repo] = splitName(fullName);
  const { data } = await github().rest.repos.listBranches({ owner, repo, per_page: 100 });
  return data.map((b) => b.name);
}

export async function createPullRequest(p: { fullName: string; head: string; base: string; title: string; body: string; draft?: boolean }) {
  const [owner, repo] = splitName(p.fullName);
  const { data } = await github().rest.pulls.create({ owner, repo, head: p.head, base: p.base, title: p.title, body: p.body, draft: p.draft ?? true });
  return { number: data.number, url: data.html_url };
}

function splitName(fullName: string): [string, string] {
  const m = fullName.match(/^([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/);
  if (!m) throw new Error(`Invalid repository name: ${fullName}`);
  return [m[1], m[2]];
}
