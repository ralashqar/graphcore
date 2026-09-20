import { z } from "npm:zod@4";
import { importURL } from "./city-network.ts";
const text = z.string().trim();
export const campusSchema = z
  .object({
    version: z.literal(1),
    layout: z.enum(["courtyard", "avenue"]),
    primaryId: text.min(1).max(60),
    exhibits: z
      .array(
        z
          .object({
            id: text.regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
            title: text.min(1).max(100),
            kind: z.enum([
              "comparison",
              "gallery",
              "guided",
              "walkthrough",
              "offer",
              "launch",
            ]),
            confirmedPair: z.boolean(),
            items: z
              .array(
                z
                  .object({
                    label: text.min(1).max(80),
                    image: z
                      .string()
                      .max(300)
                      .refine(
                        (v) =>
                          !v ||
                          /^[a-f\d-]{36}\/[a-f\d-]{36}\.(png|jpg|webp)$/.test(
                            v,
                          ),
                        "Use uploaded still images",
                      ),
                    description: text.max(500),
                    sourceUrl: z
                      .string()
                      .max(2048)
                      .refine((v) => {
                        try {
                          if (v) importURL(v);
                          return true;
                        } catch {
                          return false;
                        }
                      }),
                  })
                  .strict(),
              )
              .max(5),
          })
          .strict()
          .superRefine((e, ctx) => {
            if (!["offer", "launch"].includes(e.kind) && !e.items.length)
              ctx.addIssue({
                code: "custom",
                message: "Add at least one item",
              });
            if (
              e.kind === "comparison" &&
              (e.items.length !== 2 ||
                !e.confirmedPair ||
                e.items.some((i) => !i.image))
            )
              ctx.addIssue({
                code: "custom",
                message: "Confirm a genuine pair of two uploaded images",
              });
          }),
      )
      .min(1)
      .max(6),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.exhibits.map((e) => e.id)).size !== v.exhibits.length ||
      !v.exhibits.some((e) => e.id === v.primaryId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Use unique station IDs and an existing primary station",
      });
  });
