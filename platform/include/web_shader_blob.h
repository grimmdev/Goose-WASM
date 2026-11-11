#ifndef GOOSE_WEB_SHADER_BLOB_H
#define GOOSE_WEB_SHADER_BLOB_H
#include <stdint.h>
#include <stddef.h>
#include <string.h>
typedef struct { uint8_t location, type; } WebShaderInput;
typedef struct { uint16_t slot; uint32_t size; char name[256]; } WebShaderUniform;
typedef struct { uint16_t slot; char name[256]; } WebShaderSampler;
typedef struct {
    int stage, input_count, uniform_count, sampler_count;
    WebShaderInput inputs[16]; WebShaderUniform uniforms[16]; WebShaderSampler samplers[16];
    const char *source; uint32_t source_length;
} WebShader;
static uint16_t web_u16(const uint8_t *p) { return (uint16_t)(p[0] | (uint16_t)p[1] << 8); }
static uint32_t web_u32(const uint8_t *p) { return (uint32_t)p[0] | (uint32_t)p[1]<<8 | (uint32_t)p[2]<<16 | (uint32_t)p[3]<<24; }
static int web_read_shader(const uint8_t *p, size_t n, int stage, WebShader *out) {
    if (!p || n < 20 || memcmp(p,"GSW2",4) || web_u16(p+4)!=2 || p[6]!=stage) return 0;
    memset(out,0,sizeof *out); out->stage=stage; out->input_count=p[7];
    out->uniform_count=web_u16(p+8); out->sampler_count=web_u16(p+10);
    uint32_t src=web_u32(p+12), len=web_u32(p+16);
    if(out->input_count>16 || out->uniform_count>16 || out->sampler_count>16 || src>n || len>n-src || !len || len>0x7fffffff) return 0;
    size_t at=20;
    for(int i=0;i<out->input_count;i++) { if(at+2>src) return 0; out->inputs[i]=(WebShaderInput){p[at],p[at+1]}; if(p[at]>=16 || p[at+1]<1 || p[at+1]>12) return 0; at+=2; }
    unsigned used=0;
    for(int i=0;i<out->uniform_count;i++) {
        if(at+8>src)return 0; WebShaderUniform *u=&out->uniforms[i]; u->slot=web_u16(p+at);u->size=web_u32(p+at+2);unsigned sl=web_u16(p+at+6);at+=8;
        if(u->slot>=16 || !u->size || u->size>1048576 || sl>255 || !sl || at+sl>src || memchr(p+at,0,sl) || (used&(1u<<u->slot)))return 0;
        used|=1u<<u->slot;memcpy(u->name,p+at,sl);at+=sl;
    }
    used=0;
    for(int i=0;i<out->sampler_count;i++) {
        if(at+4>src)return 0;WebShaderSampler *s=&out->samplers[i];s->slot=web_u16(p+at);unsigned sl=web_u16(p+at+2);at+=4;
        if(s->slot>=16 || !sl || sl>255 || at+sl>src || memchr(p+at,0,sl) || (used&(1u<<s->slot)))return 0;
        used|=1u<<s->slot;memcpy(s->name,p+at,sl);at+=sl;
    }
    if(at!=src || len<15 || memcmp(p+src,"#version 300 es",15) || memchr(p+src,0,len))return 0;
    out->source=(const char *)p+src;out->source_length=len;return 1;
}
#endif
