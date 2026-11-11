import { expect, test } from "vitest";
import { issueText } from "./issueText";

test("textes des alertes", () => {
  expect(issueText({ code: "destination" })).toBe("La destination n'est pas choisie.");
  expect(issueText({ code: "seal_number", containerIndex: 1 })).toBe("Conteneur 2 : il manque le numéro de plomb.");
});
