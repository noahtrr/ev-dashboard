<script lang="ts">
	import { onMount } from 'svelte';

	// Slow liquid-bronze waves behind the page (dark theme only).
	// tone 0 is bronze, 1 is sapphire; it eases towards the new value when it changes.
	type Props = { tone?: number };
	let { tone = 0 }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let visible = $state(false);

	const vertex = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
	const fragment = `precision mediump float;
uniform float uTime;uniform vec2 uRes;uniform float uTone;
void main(){
vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;float time=uTime*0.08;float d=uTone*5.0;
vec2 w=uv;
w.x+=sin(uv.y*2.5+time*0.2+d)*0.35;w.y+=cos(uv.x*2.5-time*0.15-d*0.8)*0.35;
w.x+=sin(uv.y*1.2-time*0.1-d*1.5)*0.25;w.y+=cos(uv.x*1.2+time*0.18+d*1.2)*0.25;
vec2 d1=vec2(cos(0.6),sin(0.6));vec2 d2=vec2(cos(-0.7),sin(-0.7));vec2 d3=vec2(cos(1.2),sin(1.2));
float w1=sin(dot(w,d1)*2.4+time);float w2=cos(dot(w,d2)*3.2-time*1.4+w1*0.4);
float w3=sin(dot(w,d3)*4.0+time*1.8+w2*0.5);float f=w1*0.5+w2*0.35+w3*0.15;
float crest=pow(max(0.0,1.0-abs(f-0.1)),2.5)*0.5+pow(max(0.0,1.0-abs(f-0.15)),8.0)*0.9;
float t=smoothstep(0.0,1.0,uTone);
vec3 sh=mix(vec3(0.001,0.0006,0.0004),vec3(0.0004,0.0006,0.0012),t);
vec3 a=mix(vec3(0.085,0.04,0.015),vec3(0.015,0.035,0.065),t);
vec3 b=mix(vec3(0.05,0.022,0.008),vec3(0.008,0.02,0.045),t);
vec3 c=mix(vec3(0.45,0.3,0.18),vec3(0.18,0.35,0.55),t);
vec3 col=sh;col=mix(col,b,smoothstep(-0.6,0.2,f));col=mix(col,a,smoothstep(0.0,0.8,f));
col+=c*crest*1.4;col*=(1.0-dot(uv,uv)*0.12)*0.6;
gl_FragColor=vec4(col,1.0);}`;

	onMount(() => {
		if (!canvas) return;
		const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
		if (!gl) return;

		const compile = (type: number, src: string) => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, src);
			gl.compileShader(s);
			return s;
		};
		const program = gl.createProgram()!;
		gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
		gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		const loc = gl.getAttribLocation(program, 'p');
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		const uTime = gl.getUniformLocation(program, 'uTime');
		const uRes = gl.getUniformLocation(program, 'uRes');
		const uTone = gl.getUniformLocation(program, 'uTone');

		const darkQuery = matchMedia('(prefers-color-scheme: dark)');
		const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
		const isDark = () => {
			const forced = document.documentElement.dataset.theme;
			return forced ? forced === 'dark' : darkQuery.matches;
		};

		// Half resolution: the waves are soft, and it keeps phones cool.
		const resize = () => {
			const w = Math.max(1, Math.round(innerWidth / 2));
			const h = Math.max(1, Math.round(innerHeight / 2));
			canvas!.width = w;
			canvas!.height = h;
			gl.viewport(0, 0, w, h);
			gl.uniform2f(uRes, w, h);
		};

		const start = performance.now();
		let shown = tone;
		let frame = 0;
		let last = 0;
		const draw = (now: number) => {
			shown += (tone - shown) * 0.02;
			gl.uniform1f(uTime, (now - start) / 1000 + 40);
			gl.uniform1f(uTone, shown);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		};
		const loop = (now: number) => {
			frame = requestAnimationFrame(loop);
			if (now - last < 33) return; // about 30 frames per second is plenty
			last = now;
			draw(now);
		};
		const run = () => {
			cancelAnimationFrame(frame);
			visible = isDark();
			if (!visible) return;
			resize();
			if (motionQuery.matches) {
				shown = tone;
				draw(performance.now());
			} else {
				frame = requestAnimationFrame(loop);
			}
		};

		run();
		addEventListener('resize', run);
		darkQuery.addEventListener('change', run);
		motionQuery.addEventListener('change', run);
		return () => {
			cancelAnimationFrame(frame);
			removeEventListener('resize', run);
			darkQuery.removeEventListener('change', run);
			motionQuery.removeEventListener('change', run);
		};
	});
</script>

<canvas bind:this={canvas} class:visible aria-hidden="true"></canvas>

<style>
	canvas {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: -2;
		pointer-events: none;
		opacity: 0;
		transition: opacity 1.2s ease;
	}

	canvas.visible {
		opacity: 1;
	}
</style>
