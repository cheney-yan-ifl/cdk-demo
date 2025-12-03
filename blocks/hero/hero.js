export default function decorate(block) {
  const title = block.querySelector('h1');
  if (title) {
    title.style.transition = 'all 0.6s ease';
    requestAnimationFrame(() => {
      title.style.transform = 'translateY(0)';
      title.style.opacity = 1;
    });
  }
}
