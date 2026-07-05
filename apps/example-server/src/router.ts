import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";

const t = initTRPC
  .context<{
    requestId: string;
  }>()
  .create({
    transformer: superjson,
  });

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["admin", "member"]),
});

type User = z.infer<typeof userSchema>;

const users: User[] = [
  { id: "usr_1", name: "Ada Lovelace", role: "admin" },
  { id: "usr_2", name: "Grace Hopper", role: "member" },
];

export const appRouter = t.router({
  health: t.procedure
    .meta({ description: "Returns a basic health payload for smoke testing." })
    .output(
      z.object({
        ok: z.boolean(),
        requestId: z.string(),
        checkedAt: z.date(),
      }),
    )
    .query(({ ctx }) => ({
      ok: true,
      requestId: ctx.requestId,
      checkedAt: new Date(),
    })),
  users: t.router({
    list: t.procedure
      .meta({ description: "List users with an optional role filter." })
      .input(
        z.object({
          role: z.enum(["admin", "member"]).optional().describe("Filter by user role."),
          limit: z.number().min(1).max(50).default(10).describe("Maximum users to return."),
        }),
      )
      .output(
        z.object({
          users: z.array(userSchema),
        }),
      )
      .query(({ input }) => ({
        users: users
          .filter((user) => (input.role ? user.role === input.role : true))
          .slice(0, input.limit),
      })),
    byId: t.procedure
      .meta({ description: "Find a single user by id." })
      .input(
        z.object({
          id: z.string().describe("The user id, for example usr_1."),
        }),
      )
      .output(userSchema.nullable())
      .query(({ input }) => users.find((user) => user.id === input.id) ?? null),
    create: t.procedure
      .meta({
        description: "Create a user. This is a mutation so the runner highlights it differently.",
      })
      .input(
        z.object({
          name: z.string().min(1).describe("Display name."),
          role: z.enum(["admin", "member"]).describe("Initial role."),
          notify: z.boolean().default(false).describe("Whether to send a welcome notification."),
        }),
      )
      .output(
        z.object({
          user: userSchema,
          notified: z.boolean(),
        }),
      )
      .mutation(({ input }) => {
        const user = {
          id: `usr_${users.length + 1}`,
          name: input.name,
          role: input.role,
        };
        users.push(user);
        return { user, notified: input.notify };
      }),
  }),
  posts: t.router({
    search: t.procedure
      .input(
        z.object({
          query: z.string().describe("Search text."),
          tags: z.array(z.string()).default([]).describe("Tags that must match."),
        }),
      )
      .output(
        z.object({
          query: z.string(),
          tags: z.array(z.string()),
          results: z.array(z.unknown()),
        }),
      )
      .query(({ input }) => ({
        query: input.query,
        tags: input.tags,
        results: [],
      })),
  }),
});

export type AppRouter = typeof appRouter;
