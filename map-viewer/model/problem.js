// problem.js — a map problem as the parser reports it: a code from format/problems.json
// (the list the checker, format/check_map.py, shares) and a message for people. parseMap
// hands them out as map.problems; map.warnings keeps the messages alone.
export const problem = (code, message) => ({ code, message });
