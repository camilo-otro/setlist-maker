// Used by .github/workflows/seed-roadmap.yml via actions/github-script.
const fs = require('fs');

module.exports = async ({ github, context, core }) => {
  const roadmap = JSON.parse(fs.readFileSync(process.env.ROADMAP_JSON, 'utf8'));
  const dryRun = process.env.DRY_RUN === 'true';
  const { owner, repo } = context.repo;
  const created = { labels: 0, milestones: 0, issues: 0 };

  if (dryRun) core.notice('Dry run: nothing will be created.');

  // Labels
  const existingLabels = new Set(
    (
      await github.paginate(github.rest.issues.listLabelsForRepo, { owner, repo, per_page: 100 })
    ).map((l) => l.name.toLowerCase()),
  );
  for (const label of roadmap.labels ?? []) {
    if (existingLabels.has(label.name.toLowerCase())) continue;
    core.info(`label     + ${label.name}`);
    if (!dryRun) await github.rest.issues.createLabel({ owner, repo, ...label });
    created.labels++;
  }

  // Milestones
  const milestoneNumbers = new Map(
    (
      await github.paginate(github.rest.issues.listMilestones, {
        owner,
        repo,
        state: 'all',
        per_page: 100,
      })
    ).map((m) => [m.title, m.number]),
  );
  for (const m of roadmap.milestones ?? []) {
    if (milestoneNumbers.has(m.title)) continue;
    core.info(`milestone + ${m.title}`);
    if (!dryRun) {
      const { data } = await github.rest.issues.createMilestone({
        owner,
        repo,
        title: m.title,
        description: m.description,
        due_on: m.due_on,
      });
      milestoneNumbers.set(m.title, data.number);
    }
    created.milestones++;
  }

  // Issues (pull requests are excluded from the title match)
  const existingIssues = new Set(
    (
      await github.paginate(github.rest.issues.listForRepo, {
        owner,
        repo,
        state: 'all',
        per_page: 100,
      })
    )
      .filter((i) => !i.pull_request)
      .map((i) => i.title),
  );
  for (const issue of roadmap.issues ?? []) {
    if (existingIssues.has(issue.title)) continue;
    if (issue.milestone && !milestoneNumbers.has(issue.milestone) && !dryRun) {
      core.setFailed(`Unknown milestone "${issue.milestone}" on issue "${issue.title}"`);
      return;
    }
    core.info(`issue     + ${issue.title}`);
    if (!dryRun) {
      await github.rest.issues.create({
        owner,
        repo,
        title: issue.title,
        body: issue.body,
        labels: issue.labels ?? [],
        milestone: issue.milestone ? milestoneNumbers.get(issue.milestone) : undefined,
      });
    }
    created.issues++;
  }

  const verb = dryRun ? 'Would create' : 'Created';
  core.notice(
    `${verb} ${created.labels} labels, ${created.milestones} milestones, ${created.issues} issues.`,
  );
};
