---
name: seedance-video
description: Use when creating or editing Seedance 2 video prompts, reference-to-video workflows, storyboard-to-video clips, or GraphCore cinematic video prompt guidance.
metadata:
  author: graphcore
  version: "0.1.0"
---

# Seedance Video Prompting

## Contract

Build Seedance prompts from the exact provider reference order. Only refer to references that are actually attached:

- Images are `@Image1`, `@Image2`, etc.
- Videos are `@Video1`, `@Video2`, etc.
- Audio references are `@Audio1`, `@Audio2`, etc.

Never claim `@Image1` is a storyboard unless the storyboard sheet is actually first in the image list. If fallback drops references, rebuild the prompt with the reduced manifest.

## Preferred Structure

1. Intent: one clip, duration, aspect ratio, resolution.
2. Reference legend: each `@ImageN/@VideoN/@AudioN` gets one job.
3. Storyboard/keyframe instruction only when that reference exists.
4. Timestamped shot call sheet with action, camera, dialogue, physics, and transitions.
5. Identity/speaker guide from entity visual and voice descriptions.
6. Positive constraints plus one concise artifact ban.

## Storyboard Use

When a storyboard sheet is attached, describe it as sequential visual keyframes. Ask Seedance to follow panel order, action progression, body direction, camera rhythm, framing, lighting continuity, and pacing while animating smoothly between poses.

Do not let production-board content leak into the final video: no arrows, handwritten notes, labels, panel numbers, borders, gutters, captions, UI, guide boxes, watermarks, map diagrams, or camera-layout marks.

## Motion Guidance

Use concrete physical cues when helpful: cloth inertia, hair/fabric lag, object weight, dust displacement, water ripple, prop bounce, impact sparks, motivated glow, and debris flow.

Use Laban movement logic only for high-physicality action: martial arts, fights, chases, staff/sword choreography, impacts, aerial turns, or parkour. Do not add Laban language to quiet dialogue, romance, investigation, or environmental shots.
