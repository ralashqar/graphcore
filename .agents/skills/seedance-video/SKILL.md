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

1. Intent: one clip, aspect ratio, resolution. Do not duplicate duration in the opening line when the backend/provider duration parameter and shot call sheet already carry timing.
2. Reference legend: each `@ImageN/@VideoN/@AudioN` gets one job.
3. Storyboard/keyframe instruction only when that reference exists.
4. Directed controls: camera, subject motion, focus, framing, visibility, performance, voice, and motion intensity.
5. Short shot line with action and dialogue.
6. One concise artifact/continuity constraint.

Keep MUAPI Seedance prompts under 4000 characters. For VIP `seedance-2-vip-omni-reference`, use a compact call-sheet and short identity/speaker guide; do not paste project briefs, long world summaries, or repeated constraints into provider prompts.

For per-shot GraphCore animatic videos, use the cropped panel as the only keyframe/story reference and infer a realistic editorial duration from the shot's action, dialogue, camera movement, and settle time. Do not blindly reuse rough screenplay marker timing for shot-video provider duration. The inferred shot duration is the source of truth for the provider duration parameter and the prompt shot range.

If a character speaks offscreen, include them in the dialogue/voice guide but do not attach their art reference as a visual input. Visual image references for per-shot video should be limited to visible characters, the shot location, visible props, and the cropped panel keyframe.

Prefer compact directed controls over long cinematic prose. A useful prompt should say what the camera does, where the subject moves, what stays framed, what remains hidden/offscreen, where focus belongs, how visible characters perform, and how speakers deliver dialogue. Include concise speaker voice traits when available: gender/age cues from character context, accent, pitch, register, pace, and delivery quality.

For per-shot animatic videos, keep native audio narrow: scripted dialogue plus direct diegetic sound effects caused by visible or explicitly offscreen shot action. Do not ask for music, score, audio beds, room tone, crowd wash, or general background ambience.

## Storyboard Use

When a storyboard sheet is attached, describe it as sequential visual keyframes. Ask Seedance to follow panel order, action progression, body direction, camera rhythm, framing, lighting continuity, and pacing while animating smoothly between poses.

Do not let production-board content leak into the final video: no arrows, handwritten notes, labels, panel numbers, borders, gutters, captions, UI, guide boxes, watermarks, map diagrams, or camera-layout marks.

## Motion Guidance

Use concrete physical cues when helpful: cloth inertia, hair/fabric lag, object weight, dust displacement, water ripple, prop bounce, impact sparks, motivated glow, and debris flow.

Use Laban movement logic only for high-physicality action: martial arts, fights, chases, staff/sword choreography, impacts, aerial turns, or parkour. Do not add Laban language to quiet dialogue, romance, investigation, or environmental shots.
