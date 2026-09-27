import React from "react";

/** "Deploy lên **Vercel**" → phần trong ** ** được tô màu nhấn. */
export const Rich: React.FC<{ text: string; accent: string }> = ({ text, accent }) => (
  <>
    {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") ? (
        <span key={i} style={{ color: accent }}>
          {part.slice(2, -2)}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);

export const plain = (text: string) => text.replace(/\*\*/g, "");
