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

/* The enum values in gfx_api.h are canonical. Do not shadow them with macros. */

#ifdef __cplusplus
}
#endif

#endif /* GOOSE_WEB_CONTRACTS_H */

