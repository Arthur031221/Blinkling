/** The size a picture is first brought to before it becomes a staleness sample.
 * The reference screenshot and the live frame both go through it, so the two
 * are shrunk the same way. A thumbnail asked at the sample size is scaled by
 * the capturer in another way, and on a photo or fine text that alone reads as
 * the screen changing. */
export const middle = ({ width, height }) => ({
  width: width * 4,
  height: height * 4,
});

/** The sample bitmap of an image (anything with resize and toBitmap). */
export const sample = (image, size) =>
  image.resize(middle(size)).resize(size).toBitmap();
