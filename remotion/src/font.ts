// Be Vietnam Pro: dấu tiếng Việt đẹp, đậm tốt cho tiêu đề thumbnail.
import { loadFont } from "@remotion/google-fonts/BeVietnamPro";

export const { fontFamily } = loadFont("normal", {
  weights: ["500", "700", "800", "900"],
  subsets: ["latin", "vietnamese"],
});
