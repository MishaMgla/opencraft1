```
 ██████╗ ██████╗ ███████╗███╗   ██╗ ██████╗██████╗  █████╗ ███████╗████████╗ ██╗
██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝███║
██║   ██║██████╔╝█████╗  ██╔██╗ ██║██║     ██████╔╝███████║█████╗     ██║   ╚██║
██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║     ██╔══██╗██╔══██║██╔══╝     ██║    ██║
╚██████╔╝██║     ███████╗██║ ╚████║╚██████╗██║  ██║██║  ██║██║        ██║    ██║
 ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝    ╚═╝

                        a world built out of issues


+--------------------------------------------------------------------+
|  half game ::: half open experiment letting strangers build        |
|              together.                                             |
+--------------------------------------------------------------------+

  [ play  ] --> opencraft1.com
                https://opencraft1.com

  [ build ] --> open an issue : no fork, no setup, just write
                an idea to an issue.
                https://github.com/MishaMgla/opencraft1/issues/new


=======================[ H O W   T O ]==============================

you don't send code. you send an _idea_, and a couple of AI agents
argue it into existence.

+- example ----------------------------------------------------------+
|                                                                    |
|  you      | "players should be able to wave at each other"         |
|           |                                                        |
|  pm agent | on it. one question first: wave at everyone,           |
|           | or just folks nearby?                                  |
|           |                                                        |
|  you      | nearby                                                 |
|           |                                                        |
|  dev agent| done. PR #42, gates green, merged. it's live.          |
|           | go wave at someone.                                    |
|                                                                    |
+--------------------------------------------------------------------+

under the hood that's a pipeline you can watch happen in public:

  your idea --> [ pm agent ] --> spec --> [ dev agent ] --> PR --> [ok] green --> live
                     |                         |
                 asks you                runs the gates


====================[ U N D E R   T H E   H O O D ]=================

[ the engine ]
    Go. a single-process, fixed-tick simulation server with spatial
    interest management: every client only ever sees its own
    neighborhood, so one world can hold a crowd that keeps growing.
    talks a compact binary protocol over websockets, because bytes
    are the bill.

[ the client ]
    a vanilla browser app with ZERO runtime dependencies.
    pixijs (webgl/webgpu) draws the world; plain DOM draws the HUD.
    -> https://pixijs.com

[ the agents ]
    Codex-based PM + Dev agents living in GitHub Actions.
    the full machinery -> docs/project-map/agents.md
```
