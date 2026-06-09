---
name: Higgsfield MCP quirks
description: Non-obvious behaviours when generating video/image via the Higgsfield MCP and assembling reels.
---

# Higgsfield MCP — generation quirks

Higgsfield is configured as an MCP server; call its tools via `code_execution` callbacks (`mcpHiggsfield_*`). It generates clips/images only — it does NOT edit/stitch.

## Plan / credit limits
- `basic` plan ≈ 80 credits. On basic, Seedance only runs `mode: "fast"` (480p). `mode: "std"` / 720p returns `"Requires plus plan or higher."` with `recovery_tool: show_plans_and_credits`.
- Always preflight with `get_cost: true` (returns `cost.credits`, does not submit). Seedance fast 480p 5s ≈ 7.5 cr; std 720p 5s ≈ 22.5 cr.
- Marketing Studio webproduct/UGC video ≈ **75 cr for the default 15s** — basically a whole basic balance; don't reach for it on basic.

## generate_video gotchas
- May return a `notice.type === "preset_recommendation"` INSTEAD of submitting (no `results`). To generate your own frame/prompt literally, resubmit with `declined_preset_id` (from `notice.data.retry_literal_with.declined_preset_id`).
- Image-to-video uses **frame roles**: pass `medias: [{ value: <media_id>, role: "start_image" }]`, not `role: "image"`.
- Animating a website screenshot that prominently contains a person/face can get a **false-positive `nsfw`** terminal status (wasted credits). Prefer frames without a dominant face, or do clean camera moves in ffmpeg instead.
- Poll with `jobStatus({jobId, sync:true})`; terminal states: `completed | failed | ip_detected | nsfw`. Result URL at `generation.results.rawUrl`.

## Media upload
- `mediaUpload` → `uploads[0]` has `{upload_url, media_id, url, method}`. The `upload_url` is a presigned S3 URL containing AWS creds — **never print it** (the sandbox redacts the whole output). PUT the bytes (`fetch(upload_url,{method,body:bytes})`), then `mediaConfirm({type:'image', media_id})`. Use `media_id` in generation.

## Building a full reel
Higgsfield makes the shots; assemble locally: ffmpeg to normalise/scale to 1080x1920, burn on-screen text (drawtext), concat segments, build a branded end-card (imagemagick), then mix a music bed + Dutch VO from the `media-generation` audio tools (`generateMusic`, `searchVoices`+`textToSpeech`, multilingual model speaks Dutch). Music isn't a Higgsfield capability.
