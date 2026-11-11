// SPDX-FileCopyrightText: 2025 Erin Catto, Goose-WASM
// SPDX-License-Identifier: MIT

#include "core.h"
#include "box3d/base.h"

#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(__EMSCRIPTEN__)
#include <emscripten.h>

uint64_t b3GetTicks(void) {
    return (uint64_t)(emscripten_get_now() * 1000.0);
}

float b3GetMilliseconds(uint64_t ticks) {
    uint64_t ticksNow = b3GetTicks();
    return (float)((double)(ticksNow - ticks) / 1000.0);
}

float b3GetMillisecondsAndReset(uint64_t *ticks) {
    uint64_t ticksNow = b3GetTicks();
    float ms = (float)((double)(ticksNow - *ticks) / 1000.0);
    *ticks = ticksNow;
    return ms;
}

void b3Yield(void) {
    /* No other worker threads in serial profile */
}

void b3Sleep(int milliseconds) {
    emscripten_sleep((unsigned int)milliseconds);
}

#else

uint64_t b3GetTicks(void) { return 0; }
float b3GetMilliseconds(uint64_t ticks) { (void)ticks; return 0.0f; }
float b3GetMillisecondsAndReset(uint64_t *ticks) { (void)ticks; return 0.0f; }
void b3Yield(void) {}
void b3Sleep(int milliseconds) { (void)milliseconds; }

#endif

typedef struct b3Mutex {
    int locked;
} b3Mutex;

b3Mutex *b3CreateMutex(void) {
    b3Mutex *m = b3Alloc(sizeof(b3Mutex));
    m->locked = 0;
    return m;
}

void b3DestroyMutex(b3Mutex *m) {
    *m = (b3Mutex){ 0 };
    b3Free(m, sizeof(b3Mutex));
}

void b3LockMutex(b3Mutex *m) {
    m->locked = 1;
}

void b3UnlockMutex(b3Mutex *m) {
    m->locked = 0;
}

typedef struct b3Semaphore {
    int count;
} b3Semaphore;

b3Semaphore *b3CreateSemaphore(int initCount) {
    b3Semaphore *s = b3Alloc(sizeof(b3Semaphore));
    s->count = initCount;
    return s;
}

void b3DestroySemaphore(b3Semaphore *s) {
    *s = (b3Semaphore){ 0 };
    b3Free(s, sizeof(b3Semaphore));
}

void b3WaitSemaphore(b3Semaphore *s) {
    if (s && s->count > 0) {
        s->count--;
    }
}

void b3SignalSemaphore(b3Semaphore *s) {
    if (s) {
        s->count++;
    }
}

typedef struct b3Thread {
    int dummy;
} b3Thread;

b3Thread *b3CreateThread(b3ThreadFunction *function, void *context, const char *name) {
    (void)name;
    /* In single-threaded serial profile, workers=1; running synchronously or failing */
    if (function) {
        function(context);
    }
    b3Thread *t = b3Alloc(sizeof(b3Thread));
    t->dummy = 1;
    return t;
}

void b3JoinThread(b3Thread *t) {
    if (t) {
        *t = (b3Thread){ 0 };
        b3Free(t, sizeof(b3Thread));
    }
}

// Preserve canonical b3Hash from upstream timer.c
uint32_t b3Hash(uint32_t hash, const uint8_t *data, int count) {
    uint32_t result = hash;
    int i = 0;

    while (i + 8 <= count) {
        uint64_t word;
        memcpy(&word, data + i, sizeof(word));
#if defined(__BYTE_ORDER__) && __BYTE_ORDER__ == __ORDER_BIG_ENDIAN__
        word = ((word & 0x00000000000000FFULL) << 56) | ((word & 0x000000000000FF00ULL) << 40) |
               ((word & 0x0000000000FF0000ULL) << 24) | ((word & 0x00000000FF000000ULL) << 8) |
               ((word & 0x000000FF00000000ULL) >> 8) | ((word & 0x0000FF0000000000ULL) >> 24) |
               ((word & 0x00FF000000000000ULL) >> 40) | ((word & 0xFF00000000000000ULL) >> 56);
#endif
        result = (result << 5) + result + (uint32_t)word;
        result = (result << 5) + result + (uint32_t)(word >> 32);
        i += 8;
    }

    while (i < count) {
        result = (result << 5) + result + data[i];
        i++;
    }

    return result;
}
