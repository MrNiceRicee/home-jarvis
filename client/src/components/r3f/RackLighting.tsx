export function RackLighting() {
	return (
		<>
			{/* warm key light from upper-left (~3200K) */}
			<directionalLight
				position={[-4, 6, 8]}
				intensity={1.2}
				color="#ffcc88"
			/>
			{/* soft fill from lower-right */}
			<directionalLight
				position={[4, -2, 6]}
				intensity={0.3}
				color="#ffe8cc"
			/>
			{/* ambient — just enough to read labels in shadow */}
			<ambientLight intensity={0.15} color="#fff5e0" />
		</>
	)
}
