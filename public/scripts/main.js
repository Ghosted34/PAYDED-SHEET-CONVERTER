tailwind.config = {
  theme: {
    extend: {
      //darkMode: 'class',
      maxWidth: { 'layout': '1440px' },
      colors: {
      'navy': '#1e40af',
      'warning': '#f6b409',
      'success': '#047014'
      },
      screens: {
      'xs': '640px',   // triggers at 640px
      'custom': '766px' // triggers at 766px
      },
      boxShadow: {
      'custom': '0 2px 5px 0 rgba(0,0,0,0.08)',
      },
      keyframes: {
        "grow-up": { "0%": { height: "0" }, "100%": { height: "100%" } },
        "grow-down": { "0%": { height: "0", bottom: "0" }, "100%": { height: "100%" } },
        "expand": { "0%": { width: "0" }, "100%": { width: "100%" } },
      },
      animation: {
        "grow-up": "grow-up 0.8s ease-out forwards",
        "grow-down": "grow-down 0.8s ease-out forwards",
        "expand": "expand 0.8s ease-out forwards",
      }
    }
  }
};

