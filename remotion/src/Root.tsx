import React from "react";
import { Composition, Still } from "remotion";
import { LessonIntro, lessonIntroDefaults, lessonIntroSchema, type LessonIntroProps } from "./LessonIntro";
import { LessonThumbnail, lessonThumbnailDefaults, lessonThumbnailSchema } from "./LessonThumbnail";
import { WindowFrame, windowFrameDefaults, windowFrameSchema } from "./WindowFrame";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="LessonIntro"
      component={LessonIntro}
      schema={lessonIntroSchema}
      defaultProps={lessonIntroDefaults}
      fps={25}
      width={1920}
      height={1080}
      durationInFrames={100}
      calculateMetadata={({ props }: { props: LessonIntroProps }) => ({
        fps: props.fps,
        width: props.width,
        height: props.height,
        durationInFrames: Math.round(props.seconds * props.fps),
      })}
    />
    <Still id="WindowFrame" component={WindowFrame} schema={windowFrameSchema} defaultProps={windowFrameDefaults} width={1920} height={1080} />
    <Still id="LessonThumbnail" component={LessonThumbnail} schema={lessonThumbnailSchema} defaultProps={lessonThumbnailDefaults} width={1280} height={720} />
  </>
);
