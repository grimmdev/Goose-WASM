/* contracts.h - Canonical constants and ABI layout assertions for Goose-WASM */
#ifndef GOOSE_WEB_CONTRACTS_H
#define GOOSE_WEB_CONTRACTS_H

#include <stdint.h>
#include <stddef.h>
#include "gfx_api.h"
#include "physics_api.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Verify 32-bit wasm data layout contracts */
#if defined(__EMSCRIPTEN__) || defined(__wasm32__)
_Static_assert(sizeof(void *) == 4, "WASM pointer must be 4 bytes");
_Static_assert(sizeof(gs_gfx_buffer) == 4, "gs_gfx_buffer must be 4 bytes");
_Static_assert(sizeof(gs_gfx_texture) == 4, "gs_gfx_texture must be 4 bytes");
_Static_assert(sizeof(gs_gfx_event) == 38, "gs_gfx_event must be 38 bytes packed");
_Static_assert(sizeof(gs_phys_body) == 8, "gs_phys_body handle must be 8 bytes");
_Static_assert(sizeof(gs_phys_world) == 4, "gs_phys_world handle must be 4 bytes");
#endif

/* Canonical GFX enums derived strictly from gfx_api.h */
#define GS_GFX_CULL_NONE 0
#define GS_GFX_CULL_FRONT 1
#define GS_GFX_CULL_BACK 2

#define GS_GFX_REPEAT 0
#define GS_GFX_MIRRORED_REPEAT 1
#define GS_GFX_CLAMP 2

#define GS_GFX_VERTEX_FLOAT 1
#define GS_GFX_VERTEX_FLOAT2 2
#define GS_GFX_VERTEX_FLOAT3 3
#define GS_GFX_VERTEX_FLOAT4 4
#define GS_GFX_VERTEX_BYTE4 5
#define GS_GFX_VERTEX_BYTE4_NORM 6
#define GS_GFX_VERTEX_UBYTE4 7
#define GS_GFX_VERTEX_UBYTE4_NORM 13

#ifdef __cplusplus
}
#endif

#endif /* GOOSE_WEB_CONTRACTS_H */

