package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"

	"opencraft/internal/server"
	"opencraft/internal/world"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	sim := world.NewSim()
	go sim.Run(ctx)

	httpSrv := &http.Server{Addr: ":8080", Handler: server.New(sim).Handler()}
	go func() {
		log.Println("listening on :8080")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")
	httpSrv.Close()
}
