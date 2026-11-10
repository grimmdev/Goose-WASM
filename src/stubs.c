#include <stddef.h>

void *tcc_new(void) { return NULL; }
void tcc_delete(void *s) { (void)s; }
void tcc_set_error_func(void *s, void *error_opaque, void (*error_func)(void *opaque, const char *msg)) {
    (void)s; (void)error_opaque; (void)error_func;
}
void tcc_set_lib_path(void *s, const char *path) { (void)s; (void)path; }
int tcc_set_options(void *s, const char *str) { (void)s; (void)str; return -1; }
int tcc_add_sysinclude_path(void *s, const char *pathname) { (void)s; (void)pathname; return -1; }
int tcc_set_output_type(void *s, int output_type) { (void)s; (void)output_type; return -1; }
int tcc_add_symbol(void *s, const char *name, const void *val) { (void)s; (void)name; (void)val; return -1; }
int tcc_compile_string(void *s, const char *buf) { (void)s; (void)buf; return -1; }
int tcc_add_file(void *s, const char *filename) { (void)s; (void)filename; return -1; }
int tcc_relocate(void *s1) { (void)s1; return -1; }
void *tcc_get_symbol(void *s, const char *name) { (void)s; (void)name; return NULL; }

const void *goose_symbols_physics(void) { return NULL; }
const void *goose_symbols_gfx(void) { return NULL; }

int posix_spawnp(void *pid, const char *file, const void *file_actions, const void *attrp, char *const argv[], char *const envp[]) {
    (void)pid; (void)file; (void)file_actions; (void)attrp; (void)argv; (void)envp;
    return -1;
}
