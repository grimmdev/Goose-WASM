// Real gfx sprites plus Box3D constrained to XY. No JavaScript game translation.
import std;
import vec;
import math;
import os;
import gfx;
import physics;
import web_input;
struct Vertex2D { pos: float2, uv: float2 }
struct Sprite { center_scale: float4, tint: float4, rotation: float4 }
fn main() {
    var limit = -1;
    let argv = args();
    if argv.len == 3 && argv[1] == "--frames" { let n, ok = parse_int(argv[2]); if ok { limit = n; } }
    guard gfx::open("Goose: 2D sprites and planar physics", 800, 600) else { print(gfx::error()); return; }
    defer gfx::close();
    let world = physics::create_world(physics::WorldDef { workers: 8 });
    defer physics::destroy(world);
    let floor = physics::create_body(world, physics::BodyDef { position: float3 {0.0, -3.6, 0.0} });
    physics::create_box_shape(floor, physics::ShapeDef {}, float3 {5.0, 0.25, 0.5});
    var bodies: physics::Body[>..] = [];
    for i in 6 {
        let b = physics::create_body(world, physics::BodyDef {
            body_type: physics::DYNAMIC,
            position: float3 {(i as f32 - 2.5) * 1.1, 1.0 + (i % 3) as f32, 0.0},
            motion_locks: physics::MotionLocks {linear_z: true, angular_x: true, angular_y: true}
        });
        physics::create_box_shape(b, physics::ShapeDef {}, float3 {0.4, 0.4, 0.3});
        bodies.push(b);
    }
    let verts: Vertex2D[6] = [
        Vertex2D {float2 {-1.0,-1.0}, float2 {0.0,1.0}}, Vertex2D {float2 {1.0,-1.0},float2 {1.0,1.0}}, Vertex2D {float2 {1.0,1.0},float2 {1.0,0.0}},
        Vertex2D {float2 {-1.0,-1.0}, float2 {0.0,1.0}}, Vertex2D {float2 {1.0,1.0},float2 {1.0,0.0}}, Vertex2D {float2 {-1.0,1.0},float2 {0.0,0.0}}
    ];
    let vb = gfx::vertex_buffer(bytes_of(verts));
    let texture = gfx::load_texture("/assets/checker.png", 0);
    guard texture.id != 0 else { print("image load failed: ", gfx::error()); return; }
    let sampler = gfx::sampler(gfx::SamplerDesc {min_filter: gfx::NEAREST, mag_filter: gfx::NEAREST, mip_filter: gfx::NEAREST, wrap_u: gfx::CLAMP, wrap_v: gfx::CLAMP});
    let vs = embed_shader("vert", """
        layout(location=0) in vec2 position;
        layout(location=1) in vec2 texcoord;
        layout(set=1,binding=0) uniform Sprite { vec4 center_scale; vec4 tint; vec4 rotation; };
        layout(location=0) out vec2 uv;
        layout(location=1) out vec4 color;
        void main(){ vec2 p=position*center_scale.zw;vec2 turned=vec2(rotation.x*p.x-rotation.y*p.y,rotation.y*p.x+rotation.x*p.y);gl_Position=vec4((turned+center_scale.xy)/vec2(5.0,3.75),0.5,1.0);uv=texcoord;color=tint; }
    """);
    let fs = embed_shader("frag", """
        layout(location=0) in vec2 uv;
        layout(location=1) in vec4 color;
        layout(set=2,binding=0) uniform sampler2D sprite;
        layout(location=0) out vec4 result;
        void main(){ result=texture(sprite,uv)*color; }
    """);
    let pipeline = gfx::pipeline(vs, fs, gfx::PipelineDesc {blend: gfx::BLEND_ALPHA});
    var drawn = 0;
    while gfx::frame() {
        if gfx::key_pressed("Escape") { break; }
        let move: f32 = (if gfx::key_down("Right") {1.0} else {0.0}) - (if gfx::key_down("Left") {1.0} else {0.0}) + web_input::axis(0,0);
        if abs(move) > 0.15 { physics::set_linear_velocity(bodies[0], float3 {move*4.0, 0.0, 0.0}); }
        if gfx::mouse_pressed(1) || web_input::pressed(0, web_input::SOUTH) { physics::set_linear_velocity(bodies[0], float3 {0.0, 7.0, 0.0}); }
        physics::step(world, 1.0 / 60.0, 4);
        gfx::begin_screen(float4 {0.04,0.06,0.12,1.0});
        gfx::bind(pipeline);gfx::bind_vertex_buffer(vb);gfx::bind_texture(gfx::FRAGMENT,0,texture,sampler);
        gfx::uniforms(gfx::VERTEX,0,Sprite {float4 {0.0,-3.6,5.0,0.25},float4 {0.4,0.8,0.5,1.0},float4 {1.0,0.0,0.0,0.0}});gfx::draw(6);
        for b in bodies {
            let p = physics::position(b);let q = physics::rotation(b);
            gfx::uniforms(gfx::VERTEX,0,Sprite {float4 {p.x,p.y,0.4,0.4},float4 {1.0,1.0,1.0,1.0},float4 {1.0-2.0*q.z*q.z,2.0*q.w*q.z,0.0,0.0}});gfx::draw(6);
        }
        gfx::end_pass();drawn++;
        if drawn == limit { break; }
    }
    var planar = true;var supported = true;
    for b in bodies { let p = physics::position(b);planar = planar && abs(p.z) < 0.0001;supported = supported && p.y > -3.5; }
    var settled = true;if limit >= 240 {for b in bodies {settled = settled && abs(physics::position(b).y + 2.95) < 0.15;}}
    print("settled on floor: ",settled);
    print("planar XY: ",planar,"; floor collision: ",supported,"; frames: ",drawn);
    print("saved planar2d.png: ",gfx::screenshot("planar2d.png"));
}
