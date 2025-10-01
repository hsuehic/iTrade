'use client';
import { motion } from 'framer-motion';

export default function AIGraphic() {
  return (
    <div className="bg-[#F2F3F9] w-[383px] h-[506px] flex flex-col items-center justify-center">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="text-3xl font-bold text-blue-900"
      >
        IA
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="text-lg text-blue-800 text-center"
      >
        INTELIGENCIA <br /> ARTIFICIAL
      </motion.div>

      <div className="relative mt-4">
        {[...Array(10)].map((_, i) => (
          <motion.div
            key={i}
            className={`w-2 h-${Math.random() > 0.5 ? '6' : '3'} ${
              i % 2 === 0 ? 'bg-green-500' : 'bg-red-500'
            } absolute bottom-0`}
            style={{ left: i * 14 }}
            animate={{
              y: [0, -3, 0],
            }}
            transition={{
              duration: 1 + Math.random(),
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
    </div>
  );
}
