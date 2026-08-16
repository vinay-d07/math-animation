import { prisma, VersionAuthor } from "@manim-saas/db";

export async function createVersion(
  projectId: string,
  code: string,
  sceneClassName: string,
  createdBy: VersionAuthor,
  parentVersionId?: string | null
) {
  const version = await prisma.version.create({
    data: { projectId, code, sceneClassName, createdBy, parentVersionId: parentVersionId ?? undefined },
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { currentVersionId: version.id },
  });
  return version;
}

/**
 * Renders always operate on *some* version. If the submitted code matches the
 * project's current version exactly, reuse it instead of creating a new
 * snapshot for every preview click.
 */
export async function ensureVersion(
  projectId: string,
  code: string,
  sceneClassName: string,
  createdBy: VersionAuthor
) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  if (project.currentVersionId) {
    const current = await prisma.version.findUnique({ where: { id: project.currentVersionId } });
    if (current && current.code === code && current.sceneClassName === sceneClassName) {
      return current;
    }
  }

  return createVersion(projectId, code, sceneClassName, createdBy, project.currentVersionId);
}
