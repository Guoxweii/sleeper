/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0891B2',
        primarySoft: '#22D3EE',
        accent: '#059669',
        ink: '#164E63',
        cloud: '#F0FDFF'
      },
      boxShadow: {
        glow: '0 20px 45px -25px rgba(8, 145, 178, 0.45)'
      }
    }
  },
  plugins: []
}
