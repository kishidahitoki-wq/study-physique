'use client';

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float } from '@react-three/drei';
import * as THREE from 'three';

type PhysiqueModelProps = {
  xp: number;
};

// 筋肉質な人型（幾何学パーツで構成）
function MuscularCharacter({ xp }: { xp: number }) {
  const groupRef = useRef<THREE.Group>(null);

  // XPに応じて筋肉のボリューム（スケール）を計算 (最大 2.5倍)
  const muscleScale = Math.min(2.2, 1 + xp / 1000);
  const shoulderScale = Math.min(2.0, 1 + xp / 800);
  const chestScale = Math.min(2.0, 1 + xp / 700);

  // XPに応じた発光・カラーリング (初心者: 青 ➔ 王者: 金色)
  const getBodyColor = () => {
    if (xp >= 2500) return '#ffd700'; // 金
    if (xp >= 1200) return '#ff4500'; // 赤オレンジ
    if (xp >= 600) return '#a855f7';  // 紫
    if (xp >= 200) return '#00f2fe';  // シアン
    return '#64748b';                 // グレー
  };

  // キャラクターをゆっくり自動回転
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });

  const bodyColor = getBodyColor();

  return (
    <group ref={groupRef} position={[0, -0.5, 0]}>
      {/* 頭部 */}
      <mesh position={[0, 1.85, 0]}>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshStandardMaterial color={bodyColor} roughness={0.3} metalness={0.8} />
      </mesh>

      {/* 胴体（胸筋・腹筋） */}
      <mesh position={[0, 1.25, 0]} scale={[1 * chestScale, 1, 0.8 * chestScale]}>
        <boxGeometry args={[0.5, 0.6, 0.3]} />
        <meshStandardMaterial color={bodyColor} roughness={0.2} metalness={0.7} />
      </mesh>

      {/* ウエスト (Vシェイプ強調) */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.22 * chestScale, 0.18, 0.35, 16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} />
      </mesh>

      {/* 左肩（メロン肩） */}
      <mesh position={[-0.38 * shoulderScale, 1.45, 0]} scale={[shoulderScale, shoulderScale, shoulderScale]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color={bodyColor} roughness={0.2} metalness={0.8} />
      </mesh>

      {/* 右肩（メロン肩） */}
      <mesh position={[0.38 * shoulderScale, 1.45, 0]} scale={[shoulderScale, shoulderScale, shoulderScale]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color={bodyColor} roughness={0.2} metalness={0.8} />
      </mesh>

      {/* 左腕 (上腕二頭筋ダブルバイセップスポーズ風) */}
      <mesh position={[-0.55 * muscleScale, 1.35, 0.1]} rotation={[0, 0, 0.8]} scale={[muscleScale, muscleScale, muscleScale]}>
        <capsuleGeometry args={[0.1, 0.3, 8, 16]} />
        <meshStandardMaterial color={bodyColor} roughness={0.3} />
      </mesh>

      {/* 右腕 */}
      <mesh position={[0.55 * muscleScale, 1.35, 0.1]} rotation={[0, 0, -0.8]} scale={[muscleScale, muscleScale, muscleScale]}>
        <capsuleGeometry args={[0.1, 0.3, 8, 16]} />
        <meshStandardMaterial color={bodyColor} roughness={0.3} />
      </mesh>

      {/* 下半身・脚 */}
      <mesh position={[-0.15, 0.3, 0]}>
        <capsuleGeometry args={[0.11, 0.6, 8, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0.15, 0.3, 0]}>
        <capsuleGeometry args={[0.11, 0.6, 8, 16]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      {/* 台座 (フィジークステージ) */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.9, 1.1, 0.1, 32]} />
        <meshStandardMaterial color="#00f2fe" wireframe />
      </mesh>
    </group>
  );
}

export default function PhysiqueModel({ xp }: PhysiqueModelProps) {
  return (
    <div style={{ width: '100%', height: '220px', position: 'relative' }}>
      <Canvas camera={{ position: [0, 1.2, 3.2], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 5, 5]} intensity={1.5} />
        <pointLight position={[-5, -5, -5]} intensity={0.5} color="#00f2fe" />
        
        {/* ふわふわ浮遊エフェクト */}
        <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
          <MuscularCharacter xp={xp} />
        </Float>

        {/* ドラッグ操作で自由に360度回転可能 */}
        <OrbitControls enableZoom={false} maxPolarAngle={Math.PI / 2} minPolarAngle={Math.PI / 4} />
      </Canvas>
    </div>
  );
}