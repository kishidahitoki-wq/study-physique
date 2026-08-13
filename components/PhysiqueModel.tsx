'use client';

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float } from '@react-three/drei';
import * as THREE from 'three';

type PhysiqueModelProps = {
  xp: number;
};

function MuscularCharacter({ xp }: { xp: number }) {
  const groupRef = useRef<THREE.Group>(null);

  const muscleScale = Math.min(2.2, 1 + xp / 1000);
  const shoulderScale = Math.min(2.0, 1 + xp / 800);
  const chestScale = Math.min(2.0, 1 + xp / 700);

  // 無機質なメタル/モノクロ調の発光
  const getBodyColor = () => {
    if (xp >= 2500) return '#ffffff'; // コールドホワイト
    if (xp >= 1200) return '#00f2fe'; // シアン
    if (xp >= 600) return '#94a3b8';  // プラチナシルバー
    if (xp >= 200) return '#475569';  // メタルグレー
    return '#1e293b';                 // ダークスチール
  };

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  const bodyColor = getBodyColor();

  return (
    <group ref={groupRef} position={[0, -0.5, 0]}>
      {/* 頭部 */}
      <mesh position={[0, 1.85, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={bodyColor} roughness={0.1} metalness={0.9} wireframe={false} />
      </mesh>

      {/* 胴体 */}
      <mesh position={[0, 1.25, 0]} scale={[1 * chestScale, 1, 0.8 * chestScale]}>
        <boxGeometry args={[0.5, 0.6, 0.3]} />
        <meshStandardMaterial color={bodyColor} roughness={0.2} metalness={0.8} />
      </mesh>

      {/* ウエスト */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.22 * chestScale, 0.18, 0.35, 12]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>

      {/* 左肩 */}
      <mesh position={[-0.38 * shoulderScale, 1.45, 0]} scale={[shoulderScale, shoulderScale, shoulderScale]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color={bodyColor} roughness={0.1} metalness={0.9} />
      </mesh>

      {/* 右肩 */}
      <mesh position={[0.38 * shoulderScale, 1.45, 0]} scale={[shoulderScale, shoulderScale, shoulderScale]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color={bodyColor} roughness={0.1} metalness={0.9} />
      </mesh>

      {/* 左腕 */}
      <mesh position={[-0.55 * muscleScale, 1.35, 0.1]} rotation={[0, 0, 0.8]} scale={[muscleScale, muscleScale, muscleScale]}>
        <capsuleGeometry args={[0.1, 0.3, 6, 12]} />
        <meshStandardMaterial color={bodyColor} roughness={0.2} metalness={0.8} />
      </mesh>

      {/* 右腕 */}
      <mesh position={[0.55 * muscleScale, 1.35, 0.1]} rotation={[0, 0, -0.8]} scale={[muscleScale, muscleScale, muscleScale]}>
        <capsuleGeometry args={[0.1, 0.3, 6, 12]} />
        <meshStandardMaterial color={bodyColor} roughness={0.2} metalness={0.8} />
      </mesh>

      {/* 脚部 */}
      <mesh position={[-0.15, 0.3, 0]}>
        <capsuleGeometry args={[0.11, 0.6, 6, 12]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
      <mesh position={[0.15, 0.3, 0]}>
        <capsuleGeometry args={[0.11, 0.6, 6, 12]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>

      {/* 無機質なグリッド台座 */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[1.0, 1.0, 0.05, 16]} />
        <meshStandardMaterial color="#00f2fe" wireframe />
      </mesh>
    </group>
  );
}

export default function PhysiqueModel({ xp }: PhysiqueModelProps) {
  return (
    <div style={{ width: '100%', height: '200px', position: 'relative' }}>
      <Canvas camera={{ position: [0, 1.2, 3.2], fov: 45 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={2.0} color="#ffffff" />
        <pointLight position={[-5, -2, -2]} intensity={0.8} color="#00f2fe" />
        
        <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.3}>
          <MuscularCharacter xp={xp} />
        </Float>

        <OrbitControls enableZoom={false} maxPolarAngle={Math.PI / 2} minPolarAngle={Math.PI / 4} />
      </Canvas>
    </div>
  );
}