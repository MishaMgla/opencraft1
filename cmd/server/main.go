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

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	httpSrv := &http.Server{Addr: addr, Handler: server.New(sim).Handler()}
	go func() {
		log.Printf("listening on %s", addr)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down")
	httpSrv.Close()
}
