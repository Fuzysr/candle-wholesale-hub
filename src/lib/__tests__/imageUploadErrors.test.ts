import { describe, expect, it } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { imageUploadErrorMessage, validateImageFile } from "../imageUploadErrors";

const responseError = (detail: string, status = 400) => {
  const error = new AxiosError("Request failed");
  error.response = {
    data: { detail },
    status,
    statusText: "Error",
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
};

describe("image upload feedback", () => {
  it("explains a MIME mismatch without exposing the technical backend text", () => {
    const message = imageUploadErrorMessage(
      responseError("declared content-type image/png does not match actual content (image/jpeg)"),
      "photo.png",
    );

    expect(message).toContain("photo.png");
    expect(message).toContain("не совпадает");
    expect(message).toContain("Пересохраните");
    expect(message).not.toContain("content-type");
  });

  it("covers unsupported, corrupt, empty and oversized uploads", () => {
    expect(imageUploadErrorMessage(responseError("unsupported content type: image/gif"))).toContain("Неподдерживаемый формат".toLowerCase());
    expect(imageUploadErrorMessage(responseError("file content does not match any supported image format"))).toContain("повреждён");
    expect(imageUploadErrorMessage(responseError("empty upload"))).toContain("пустой");
    expect(imageUploadErrorMessage(responseError("file too large", 413))).toContain("5 МБ");
  });

  it("provides actionable messages for authorization, server and network failures", () => {
    expect(imageUploadErrorMessage(responseError("unauthorized", 401))).toContain("Войдите");
    expect(imageUploadErrorMessage(responseError("forbidden", 403))).toContain("нет прав");
    expect(imageUploadErrorMessage(responseError("internal", 500))).toContain("сервер временно");

    const networkError = new AxiosError("Network Error", "ERR_NETWORK");
    expect(imageUploadErrorMessage(networkError)).toContain("нет соединения");
  });

  it("validates empty, unsupported and oversized files before sending", () => {
    expect(validateImageFile(new File([], "empty.png", { type: "image/png" }))).toContain("пустой");
    expect(validateImageFile(new File(["gif"], "a.gif", { type: "image/gif" }))).toContain("Неподдерживаемый");
    expect(validateImageFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }))).toContain("5 МБ");
    expect(validateImageFile(new File(["jpeg"], "ok.jpg", { type: "image/jpeg" }))).toBeNull();
  });
});
