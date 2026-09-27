import chalk from 'chalk';

const SEED_LOGO = [
  '███████╗███████╗███████╗██████╗',
  '██╔════╝██╔════╝██╔════╝██╔══██╗',
  '███████╗█████╗  █████╗  ██║  ██║',
  '╚════██║██╔══╝  ██╔══╝  ██║  ██║',
  '███████║███████╗███████╗██████╔╝',
  '╚══════╝╚══════╝╚══════╝╚═════╝',
].join('\n');

export const logoText = SEED_LOGO;
export const logoOutput = chalk.green(`${SEED_LOGO}\n`);

/** Clear a real interactive terminal between conversational turns so an
 * ongoing `seed` / `grow` session does not scroll into a wall of repeated
 * questions and answers. A non-TTY (piped, redirected, or --json) session
 * never clears, since scripts and log capture must keep every line. */
export function clearTurnScreen(): void {
  if (process.stdout.isTTY) console.clear();
}
