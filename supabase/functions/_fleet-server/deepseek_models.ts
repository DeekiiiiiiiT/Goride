/**
 * The DeepSeek model the owner's-manual reader uses (docs/maintenance-enterprise-rebuild-review.md B4).
 *
 * Checked against the live API docs on 27 Nov 2026 (https://api-docs.deepseek.com/guides/vision and
 * /guides/document_parsing): `deepseek-flash` is the model that accepts images and files. The legacy name
 * `deepseek-v4-flash-vision-exp` is still accepted but served by the same current model, so it is not used.
 *
 * Change the model id here only; the reader, its pricing row and its tests read this one constant.
 */
export const DEEPSEEK_VISION_MODEL = "deepseek-flash";
